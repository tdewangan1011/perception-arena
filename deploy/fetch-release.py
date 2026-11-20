"""Fetch the private, checksum-pinned runtime bundle during a container build."""
import hashlib
import json
import os
import shutil
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from zipfile import ZipFile


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(destination):
    token = Path('/run/secrets/github-token').read_text().strip()
    headers = {'Authorization': f'Bearer {token}', 'User-Agent': 'Perception-Arena-deploy',
               'Accept': 'application/vnd.github+json'}
    api = 'https://api.github.com/repos/tdewangan1011/perception-arena'
    request = urllib.request.Request(f'{api}/releases/tags/{os.environ["RELEASE_TAG"]}', headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        release = json.load(response)
    asset = next(a for a in release['assets'] if a['name'] == 'perception-arena.zip')
    headers['Accept'] = 'application/octet-stream'
    request = urllib.request.Request(asset['url'], headers=headers)
    try:
        response = urllib.request.build_opener(NoRedirect).open(request, timeout=120)
    except urllib.error.HTTPError as error:
        if error.code not in (301, 302, 303, 307, 308):
            raise
        # The signed storage URL must not receive the GitHub credential.
        response = urllib.request.urlopen(error.headers['Location'], timeout=120)
    with response, destination.open('wb') as output:
        shutil.copyfileobj(response, output)


def main():
    with tempfile.TemporaryDirectory() as temporary:
        archive = Path(temporary) / 'release.zip'
        fetch(archive)
        with archive.open('rb') as content:
            actual = hashlib.file_digest(content, 'sha256').hexdigest()
        if actual != os.environ['RELEASE_SHA256'].lower():
            raise RuntimeError('Release checksum mismatch')
        target = Path('/bundle')
        with ZipFile(archive) as release:
            for item in release.infolist():
                path = (target / item.filename).resolve()
                if not path.is_relative_to(target):
                    raise RuntimeError('Unsafe archive path')
            release.extractall(target)
    print('Verified runtime bundle downloaded and extracted.')


if __name__ == '__main__':
    main()
