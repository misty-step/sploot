// Synthetic gate-1 set. No real library copy was on this machine.
// These are queries and target ids, not pictures: painting glyphs without a
// font would not be a fair vision set, and copyrighted memes were not downloaded.

const textPhrases = [
  "sentient toaster",
  "budget hawk",
  "left sock tribunal",
  "polite raccoon",
  "municipal goose",
  "unpaid intern moon",
  "ceramic witness",
  "folding chair cult",
  "spare key prophecy",
  "damp confetti",
  "office fern uprising",
  "late bus oracle",
  "quiet blender",
  "stamped approval",
  "second napkin",
];

const visualScenes = [
  "red circle centered on a blue square",
  "yellow triangle pointing down",
  "three green horizontal bars",
  "orange ring around a purple dot",
  "diagonal white stripe on gray",
  "two stacked cyan rectangles",
  "pink square in the lower left",
  "brown oval on a tan field",
  "small blue dots in a grid",
  "thick black border around an empty center",
  "green arrow pointing left",
  "one vertical magenta line",
  "navy and gold checker",
  "pale circle clipped by the right edge",
  "wide teal band across the top",
];

const templatePairs = [
  ["clipboard", "bring a pencil", "bring a ladder"],
  ["name tag", "hello brine", "hello gravel"],
  ["sticky note", "call the fern", "call the harbor"],
  ["marquee", "tonight only", "tomorrow never"],
  ["street sign", "no singing", "no hovering"],
  ["cereal box", "crunch time", "soggy time"],
  ["ticket stub", "row eleven", "row twelve"],
  ["wanted poster", "missing kettle", "missing compass"],
  ["chalkboard", "pop quiz", "snow day"],
  ["mug slogan", "more soup", "less soup"],
];

export const golden = {
  source: "synthetic",
  pixels: "not generated",
  text: textPhrases.map((phrase, index) => ({
    id: `text-${String(index + 1).padStart(2, "0")}`,
    query: phrase,
    ocr_text: phrase,
  })),
  visual: visualScenes.map((scene, index) => ({
    id: `visual-${String(index + 1).padStart(2, "0")}`,
    query: scene,
  })),
  templates: templatePairs.map(([template, targetText, siblingText], index) => ({
    template,
    target: `pair-${String(index + 1).padStart(2, "0")}-a`,
    sibling: `pair-${String(index + 1).padStart(2, "0")}-b`,
    query: targetText,
    target_text: targetText,
    sibling_text: siblingText,
  })),
  refused: Array.from({ length: 10 }, (_, index) => {
    const note = `attention note ${String(index + 1).padStart(2, "0")}`;
    return {
      id: `refused-${String(index + 1).padStart(2, "0")}`,
      note,
      query: note,
      pixels: "gray placeholder, not an edgy image",
    };
  }),
};
