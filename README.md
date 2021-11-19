# Actions DCO

GitHub Actions that enforces the Developer Certificate of Origin (DCO) on Pull Requests.

## Example usage

```yml
name: DCO Check

on: [pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: tisonkun/actions-dco@v1.1
```
