#!/usr/bin/env python3
"""Capture, verify, encrypt and retain a native library snapshot in private R2.

Staging admits a conservative snapshot+tar+age footprint through the shared
reservation ledger before any of those files are created. The archive is still
a complete tar, then a separate age ciphertext. Streaming tar into age is not
this runner.
"""

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

# Must match apps/server/internal/diskreserve DirectoryName.
LEDGER_DIRECTORY = '.disk-reserve'
DEFAULT_RESERVE_BYTES = 1 << 30


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


def reserve_bytes_from_env():
    raw = os.environ.get('SPLOOT_STORAGE_RESERVE_BYTES')
    if raw is None:
        return DEFAULT_RESERVE_BYTES
    if not raw.isdigit():
        raise RuntimeError('SPLOOT_STORAGE_RESERVE_BYTES must be a nonnegative integer')
    return int(raw)


def staging_estimate(command, data_dir, target):
    out = run([command, 'staging-bytes', '--data-dir', str(data_dir), '--target', str(target)])
    text = out.decode().strip()
    if not text.isdigit():
        raise RuntimeError('staging estimate was not a byte count')
    return int(text)


class Reservation:
    """Holds the backup claim until release. The child exits when stdin closes
    or this process dies, so the claim cannot outlive the runner."""

    def __init__(self, proc):
        self.proc = proc

    def alive(self):
        return self.proc is not None and self.proc.poll() is None

    def release(self):
        proc = self.proc
        self.proc = None
        if proc is None:
            return
        try:
            if proc.stdin:
                proc.stdin.close()
        except Exception:
            pass
        try:
            proc.wait(timeout=60)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()


def acquire_reservation(command, ledger, target, nbytes, reserve):
    proc = subprocess.Popen(
        [command, 'reserve', '--ledger', str(ledger), '--target', str(target),
         '--bytes', str(nbytes), '--reserve-bytes', str(reserve)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    line = proc.stdout.readline()
    if line.strip() != b'reserved':
        stderr = proc.stderr.read().decode('utf-8', 'replace').strip().splitlines()
        proc.wait()
        message = stderr[0] if stderr else 'staging reservation was refused'
        raise RuntimeError(message)
    return Reservation(proc)


def require_reservation(reservation):
    if not reservation.alive():
        raise RuntimeError('staging reservation ended before backup finished')


def build_storage(args):
    import boto3
    from boto3.s3.transfer import TransferConfig
    from botocore.config import Config

    endpoint = urlparse(args.bucket_url)
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
    return storage, transfer


def main(argv=None, storage_factory=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, required=True)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--backup-command', required=True)
    parser.add_argument('--recipient', required=True)
    parser.add_argument('--bucket-url', required=True)
    parser.add_argument('--credentials', type=Path, required=True)
    parser.add_argument('--status-file', type=Path, required=True)
    args = parser.parse_args(argv)
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
    credential_directory = os.environ.get('CREDENTIALS_DIRECTORY')
    credential_stat = args.credentials.stat()
    # systemd grants the service read access through an ACL; its mask is 0440.
    managed_credential = (
        credential_directory
        and args.credentials.parent == Path(credential_directory)
        and credential_stat.st_uid == 0
        and credential_stat.st_mode & 0o777 == 0o440
    )
    if (args.credentials.is_symlink() or not args.credentials.is_file()
            or (credential_stat.st_mode & 0o077 and not managed_credential)):
        parser.error('storage credentials must be a private, real file')
    credentials = configparser.ConfigParser(interpolation=None)
    credentials.read(args.credentials)
    if 'default' not in credentials or 'aws_access_key_id' not in credentials['default'] or 'aws_secret_access_key' not in credentials['default']:
        parser.error('storage credentials must contain the default access key pair')
    now = dt.datetime.now(dt.timezone.utc)
    stamp = now.strftime('%Y%m%dT%H%M%SZ')
    phase = 'lock'
    with (args.work_dir / 'backup.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('backup already running')
        reservation = None
        try:
            try:
                phase = 'reserve'
                operating_reserve = reserve_bytes_from_env()
                estimate = staging_estimate(args.backup_command, args.data_dir, args.work_dir)
                reservation = acquire_reservation(
                    args.backup_command, args.data_dir / LEDGER_DIRECTORY, args.work_dir,
                    estimate, operating_reserve)
                with tempfile.TemporaryDirectory(prefix='snapshot-', dir=args.work_dir) as temporary:
                    root = Path(temporary)
                    snapshot = root / 'snapshot'
                    require_reservation(reservation)
                    phase = 'capture'
                    run([args.backup_command, 'backup', '--data-dir', str(args.data_dir),
                         '--directory', str(snapshot)])
                    require_reservation(reservation)
                    phase = 'verify'
                    run([args.backup_command, 'verify', '--directory', str(snapshot)])
                    require_reservation(reservation)
                    phase = 'archive'
                    archive = root / 'snapshot.tar'
                    run(['tar', '-C', str(root), '-cf', str(archive), 'snapshot'])
                    require_reservation(reservation)
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
                    require_reservation(reservation)
                    if storage_factory is None:
                        storage, transfer = build_storage(args)
                    else:
                        storage, transfer = storage_factory(args)
                    for key in keys:
                        phase = 'upload'
                        require_reservation(reservation)
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
        finally:
            if reservation is not None:
                reservation.release()


if __name__ == '__main__':
    main()
