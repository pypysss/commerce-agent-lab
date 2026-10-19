"""Check actual API and page readiness before the launcher reports success."""
import argparse
import json
import sys
import time
from urllib.request import urlopen


def check_ready(api_url, web_url):
    with urlopen(api_url, timeout=2) as response:
        products = json.load(response)
    with urlopen(web_url, timeout=2) as response:
        page = response.read().decode('utf-8')
    return (isinstance(products, dict)
            and isinstance(products.get('items'), list)
            and products.get('page') == 1
            and '<div id="app">' in page)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', required=True)
    parser.add_argument('--web', required=True)
    parser.add_argument('--timeout', type=float, default=30)
    args = parser.parse_args()
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        try:
            if check_ready(args.api, args.web):
                print('API and page readiness verified.')
                return 0
        except (OSError, ValueError):
            pass
        time.sleep(0.25)
    print('Services did not become ready; check state/ logs and port conflicts.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
