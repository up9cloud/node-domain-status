# domain-status

## Install

```bash
npm i -g domain-status
```

## Usage

```bash
# check one
domain-status --domain google.com

# check all ???.com (0-9) domains, 000.com ~ 999.com
domain-status --chars-group 0-9 --length 3 domain-suffix .com > 0-9.com.log

# check by http
domain-status --chars 01- --method http --domain-exclude-file ./test/exclude.log ./test/exclude.err > 01.app.log >> 01.app.err
```

> see more

```bash
domain-status --help
```
