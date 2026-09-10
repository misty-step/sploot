#!/usr/bin/env python3
"""Capture, verify, encrypt and retain a native library snapshot in private R2."""

import argparse
import configparser
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config


def run(arguments, *, stdout=None):
    result = subprocess.run(arguments, stdout=stdout or subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        # Commands can contain private filesystem paths; do not echo their output.
        raise RuntimeError(f"{Path(arguments[0]).name} exited {result.returncode}")
    return result.stdout


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def publish_status(path, value):
    temporary = path.with_name(path.name + '.pending')
    temporary.write_text(json.dumps(value, sort_keys=True) + '\n')
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, required=True)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--backup-command', required=True)
    parser.add_argument('--recipient', required=True)
    parser.add_argument('--bucket-url', required=True)
    parser.add_argument('--credentials', type=Path, required=True)
    parser.add_argument('--status-file', type=Path, required=True)
    args = parser.parse_args()
    endpoint = urlparse(args.bucket_url)
    if (endpoint.scheme != 'https' or not endpoint.hostname
            or not endpoint.hostname.endswith('.r2.cloudflarestorage.com')
            or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment
            or endpoint.path != '/sploot-recovery'):
        parser.error('bucket URL must name the private sploot-recovery R2 bucket over HTTPS')
    if not args.recipient.startswith('age1'):
        parser.error('an age public recipient is required, never a private identity')
    os.umask(0o077)
    args.work_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    if args.work_dir.is_symlink() or args.work_dir.stat().st_mode & 0o077:
        parser.error('work directory must be a private, real directory')
    if (args.credentials.is_symlink() or not args.credentials.is_file()
            or args.credentials.stat().st_mode & 0o077):
        parser.error('storage credentials must be a private, real file')
    credentials = configparser.ConfigParser(interpolation=None)
    credentials.read(args.credentials)
    storage = boto3.client(
        's3', endpoint_url=f'{endpoint.scheme}://{endpoint.netloc}', region_name='auto',
        aws_access_key_id=credentials['default']['aws_access_key_id'],
        aws_secret_access_key=credentials['default']['aws_secret_access_key'],
        config=Config(connect_timeout=15, read_timeout=120, retries={'max_attempts': 3}),
    )
    transfer = TransferConfig(max_concurrency=2, multipart_threshold=16 * 1024 * 1024,
                              multipart_chunksize=16 * 1024 * 1024)
    now = dt.datetime.now(dt.timezone.utc)
    stamp = now.strftime('%Y%m%dT%H%M%SZ')
    phase = 'lock'
    with (args.work_dir / 'backup.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('backup already running')
        try:
            with tempfile.TemporaryDirectory(prefix='snapshot-', dir=args.work_dir) as temporary:
                root = Path(temporary)
                snapshot = root / 'snapshot'
                phase = 'capture'
                run([args.backup_command, 'backup', '--data-dir', str(args.data_dir),
                     '--directory', str(snapshot)])
                phase = 'verify'
                run([args.backup_command, 'verify', '--directory', str(snapshot)])
                phase = 'archive'
                archive = root / 'snapshot.tar'
                run(['tar', '-C', str(root), '-cf', str(archive), 'snapshot'])
                phase = 'encrypt'
                encrypted = root / 'snapshot.tar.age'
                run(['age', '--recipient', args.recipient, '--output', str(encrypted), str(archive)])
                archive.unlink()
                checksum = digest(encrypted)
                size = encrypted.stat().st_size
                keys = [f'production/hourly/{stamp}.tar.age']
                # Every successful run repairs today's daily copy if the midnight run failed.
                daily_key = f'production/daily/{stamp}.tar.age'
                daily_marker = args.work_dir / f'daily-{now:%Y%m%d}.json'
                if not daily_marker.exists():
                    keys.append(daily_key)
                for key in keys:
                    phase = 'upload'
                    storage.upload_file(str(encrypted), 'sploot-recovery', key,
                                        ExtraArgs={'Metadata': {'sha256': checksum},
                                                   'ChecksumAlgorithm': 'SHA256'},
                                        Config=transfer)
                    phase = 'remote-receipt'
                    received = storage.head_object(Bucket='sploot-recovery', Key=key)
                    if (received.get('Metadata', {}).get('sha256') != checksum
                            or received.get('ContentLength') != size):
                        raise RuntimeError('remote encrypted-object receipt mismatch')
                    if key == daily_key:
                        publish_status(daily_marker, {'key': key, 'sha256': checksum, 'bytes': size})
                status = {'status': 'ok', 'completedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                          'keys': keys, 'encryptedSHA256': checksum, 'encryptedBytes': size,
                          'scope': 'native library only; source archive is retained independently'}
                publish_status(args.status_file, status)
                print(json.dumps(status, sort_keys=True))
        except Exception as error:
            failure = {'status': 'failed', 'phase': phase, 'error': str(error),
                       'observedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
            publish_status(args.status_file.with_name(args.status_file.name + '.failure'), failure)
            raise SystemExit(json.dumps(failure, sort_keys=True)) from None


if __name__ == '__main__':
    main()
