# Check symbols

Random REF check symbols use the Crockford modulo-37 convention.

Data alphabet values 0 through 31 are:

```text
0123456789ABCDEFGHJKMNPQRSTVWXYZ
```

Check alphabet values 0 through 36 are:

```text
0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U
```

To calculate a random REF check symbol:

1. Normalize the payload to canonical data symbols.
2. Interpret the payload as a base-32 non-negative integer.
3. Calculate the integer modulo 37.
4. Select the check-alphabet symbol at that value.

Implementations SHOULD calculate the remainder incrementally to avoid integer-size differences:

```text
remainder = 0
for each payload value:
    remainder = (remainder * 32 + value) mod 37
```

The prefix and hyphens are not included. Prefix validity is enforced by the namespace registry.

Sequential REF check symbols use the same modulo-37 check alphabet. Each decimal digit is consumed as its numeric value using radix 10:

```text
remainder = 0
for each scope-and-sequence digit:
    remainder = (remainder * 10 + digit) mod 37
```

Check symbols detect common transcription errors. They are not cryptographic integrity protection and MUST NOT be used as authentication.
