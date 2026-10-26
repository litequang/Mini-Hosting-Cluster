#!/usr/bin/env python3
"""Reject unsafe/unreasonably large site archives before extraction (stdlib only)."""
import os
import pathlib
import stat
import sys
import zipfile

MAX_FILES = 10000
MAX_SIZE = 300 * 1024 * 1024
MAX_SINGLE = 80 * 1024 * 1024


def fail(message):
    raise ValueError(message)


def extract(src, dst):
    target = pathlib.Path(dst)
    if not target.is_dir() or any(target.iterdir()):
        fail('destination must be an empty directory')
    with zipfile.ZipFile(src) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_FILES:
            fail('too many files')
        total = 0
        paths = set()
        files = set()
        for info in entries:
            name = info.filename
            if ('\\' in name or '\x00' in name or name.startswith('/') or
                    ':' in name or name.startswith('//')):
                fail('unsafe archive filename')
            p = pathlib.PurePosixPath(name)
            if not name or any(part in ('', '.', '..') for part in p.parts) or p.is_absolute():
                fail('archive traversal or empty path')
            key = p.as_posix().rstrip('/')
            if key in paths:
                fail('duplicate archive path')
            paths.add(key)
            mode = info.external_attr >> 16
            if stat.S_ISLNK(mode) or (mode and stat.S_IFMT(mode) not in (0, stat.S_IFDIR, stat.S_IFREG)):
                fail('links/devices are not allowed')
            total += info.file_size
            if total > MAX_SIZE or info.file_size > MAX_SINGLE:
                fail('archive is too large')
            if not info.is_dir():
                if pathlib.PurePosixPath(key).suffix.lower() in {'.php', '.phtml', '.phar', '.env', '.key', '.sql', '.bak'}:
                    fail('server-side code or secrets not allowed in static website ZIP')
                if any(part.startswith('.') for part in p.parts):
                    fail('hidden files and directories not allowed in static website ZIP')
                files.add(key)
        if 'index.html' not in files:
            fail('static website ZIP must have index.html at root')
        for info in entries:
            output = target.joinpath(*pathlib.PurePosixPath(info.filename).parts)
            if info.is_dir():
                output.mkdir(mode=0o700, parents=True, exist_ok=True)
                continue
            output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            # Exclusive file creation prevents overwrite or unexpected reused paths.
            with archive.open(info) as handle, open(output, 'xb') as dest:
                while True:
                    data = handle.read(1024 * 1024)
                    if not data:
                        break
                    dest.write(data)
            output.chmod(0o600)
    return len(files)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: safe-zip-extract.py SITE.zip EMPTY_DIRECTORY', file=sys.stderr)
        sys.exit(2)
    try:
        n = extract(sys.argv[1], sys.argv[2])
        print(f'Extracted {n} regular files (non-executable permissions).')
    except (OSError, zipfile.BadZipFile, RuntimeError, ValueError) as exc:
        print(f'REJECTED: {exc}', file=sys.stderr)
        sys.exit(1)
