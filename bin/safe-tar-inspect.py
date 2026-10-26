#!/usr/bin/env python3
"""Validate a verified gzip tar before offline extraction (refuse links/traversal)."""
import pathlib
import sys
import tarfile

MAX_ENTRIES = 200000
MAX_BYTES = 12 * 1024 * 1024 * 1024

def check(path):
    total = 0
    with tarfile.open(path, 'r:gz') as tf:
        for i, info in enumerate(tf):
            if i >= MAX_ENTRIES:
                raise ValueError('too many entries')
            if not (info.isfile() or info.isdir()):
                raise ValueError('links and special entries are forbidden in offline restore')
            if info.name.startswith('/') or '\\' in info.name or ':' in info.name or '\x00' in info.name:
                raise ValueError('absolute or malformed tar path')
            raw = info.name.split('/')
            if any(x == '..' for x in raw) or pathlib.PurePosixPath(info.name).is_absolute():
                raise ValueError('tar path escapes destination')
            total += info.size
            if total > MAX_BYTES:
                raise ValueError('tar expanded size limit exceeded')

if __name__ == '__main__':
    try:
        for item in sys.argv[1:]:
            check(item)
        print('PASS: offline tar members are regular files/directories with safe paths')
    except (OSError, tarfile.TarError, ValueError) as e:
        print(f'REJECTED: {e}', file=sys.stderr)
        sys.exit(1)
