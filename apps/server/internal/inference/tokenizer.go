package inference

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
)

const contextLength = 77
const startToken int64 = 49406
const endToken int64 = 49407
const maxTextBytes = 8192

// The expression and normalization are from the pinned tokenizer.json, not
// OpenAI's older Python tokenizer (which additionally used ftfy/HTML cleanup).
var clipWords = regexp.MustCompile(`<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+`)
var byteWords = regexp.MustCompile(`'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]+|[^\s\p{L}\p{N}]+`)

type tokenizer struct {
	vocabulary map[string]int64
	ranks      map[[2]string]int
	bytes      [256]string
}

func loadTokenizer(path string) (*tokenizer, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read CLIP tokenizer: %w", err)
	}
	var definition struct {
		Model struct {
			Type       string           `json:"type"`
			Vocabulary map[string]int64 `json:"vocab"`
			Merges     []string         `json:"merges"`
		} `json:"model"`
	}
	if err := json.Unmarshal(data, &definition); err != nil {
		return nil, fmt.Errorf("decode CLIP tokenizer: %w", err)
	}
	if definition.Model.Type != "BPE" || len(definition.Model.Vocabulary) != 49408 || len(definition.Model.Merges) != 48894 {
		return nil, fmt.Errorf("pinned CLIP tokenizer has an unexpected BPE vocabulary")
	}
	t := &tokenizer{vocabulary: definition.Model.Vocabulary, ranks: make(map[[2]string]int, len(definition.Model.Merges))}
	for rank, merge := range definition.Model.Merges {
		left, right, ok := strings.Cut(merge, " ")
		if !ok {
			return nil, fmt.Errorf("invalid CLIP merge at rank %d", rank)
		}
		t.ranks[[2]string{left, right}] = rank
	}
	// GPT-2/CLIP's reversible byte-to-Unicode alphabet skips whitespace and
	// control code points. The order of the additional code points matters.
	next := rune(256)
	for b := range t.bytes {
		if (b >= 33 && b <= 126) || (b >= 161 && b <= 172) || b >= 174 {
			t.bytes[b] = string(rune(b))
		} else {
			t.bytes[b] = string(next)
			next++
		}
	}
	return t, nil
}

// encode fills the reusable input tensor, truncating content to 75 tokens so
// the final EOS always fits. CLIP's causal encoder pools the first EOS; padding
// with EOS leaves that projection unchanged and requires no attention mask.
func (t *tokenizer) encode(text string, destination []int64) error {
	if len(text) > maxTextBytes || !utf8.ValidString(text) {
		return fmt.Errorf("search text must be valid UTF-8 and at most %d bytes", maxTextBytes)
	}
	if strings.TrimSpace(text) == "" {
		return fmt.Errorf("search text must not be empty")
	}
	for i := range destination {
		destination[i] = endToken
	}
	destination[0] = startToken
	position := 1
	for {
		// EOS is an added token with normalized=false: recognize it before
		// normalization. BOS has normalized=true and is recognized afterward.
		segment, rest, hasEOS := strings.Cut(text, "<|endoftext|>")
		segment = norm.NFC.String(segment)
		// RE2 \s is ASCII-only. Fold Unicode whitespace before matching.
		segment = strings.Join(strings.FieldsFunc(segment, unicode.IsSpace), " ")
		// The pinned Rust tokenizer lowercases characters independently; it
		// does not apply contextual Greek final-sigma substitution.
		segment = cases.Lower(language.Und, cases.HandleFinalSigma(false)).String(segment)
		for _, word := range clipWords.FindAllString(segment, -1) {
			if position == contextLength-1 {
				return nil
			}
			if word == "<|startoftext|>" {
				destination[position] = startToken
				position++
				continue
			}
			// ByteLevel applies its own split after CLIP's split. This matters
			// for special-token-looking text produced only by lowercasing.
			for _, part := range byteWords.FindAllString(word, -1) {
				position += copy(destination[position:contextLength-1], t.encodeWord(part))
				if position == contextLength-1 {
					return nil
				}
			}
		}
		if !hasEOS || position == contextLength-1 {
			return nil
		}
		destination[position] = endToken
		position++
		text = rest
	}
}

func (t *tokenizer) encodeWord(word string) []int64 {
	pieces := make([]string, len(word))
	for i := range len(word) {
		pieces[i] = t.bytes[word[i]]
	}
	pieces[len(pieces)-1] += "</w>"
	for len(pieces) > 1 {
		bestRank := len(t.ranks)
		var best [2]string
		for i := range len(pieces) - 1 {
			pair := [2]string{pieces[i], pieces[i+1]}
			if rank, ok := t.ranks[pair]; ok && rank < bestRank {
				best, bestRank = pair, rank
			}
		}
		if bestRank == len(t.ranks) {
			break
		}
		merged := pieces[:0]
		for i := 0; i < len(pieces); i++ {
			if i+1 < len(pieces) && pieces[i] == best[0] && pieces[i+1] == best[1] {
				merged = append(merged, pieces[i]+pieces[i+1])
				i++
			} else {
				merged = append(merged, pieces[i])
			}
		}
		pieces = merged
	}
	tokens := make([]int64, len(pieces))
	for i, piece := range pieces {
		if id, ok := t.vocabulary[piece]; ok {
			tokens[i] = id
		} else {
			tokens[i] = endToken
		}
	}
	return tokens
}
