# domain-status

## Install

```bash
npm i -g domain-status
```

## Usage

```bash
# check one by whois
domain-status --domain google.com

# check all ???.com (0-9) domains, 000.com ~ 999.com
domain-status --chars-group 0-9 --length 3 domain-suffix .com >> whois.0-9.com.log

# check with exclude files
domain-status --domain-exclude-file ./test/exclude.log ./test/exclude.err >> whois.0-9.com.log

# check by existing data files
domain-status --domain-file whois.0-9.com.log >> whois.0-9.com.log.1

# check by http
domain-status --method http --chars 01- >> http.01-.app.log 2>> http.01-.app.err
```

> see more

```bash
domain-status --help
```
