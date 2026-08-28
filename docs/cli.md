# Command-line interface

`identifold new <namespace>` creates a UUIDv7 MID and its TypeID PID. It does not allocate a REF because REF uniqueness requires an external atomic store or sequence allocator.

`inspect`, `validate`, and `normalize` accept `--registry <path>` for a JSON array of namespace definitions. MID operations and PID operations with an inferable prefix can run without that file. `conformance` invokes the repository's language-neutral runner and accepts `--adapter <path>`.

Every command accepts `--json`. Exit `0` means success or valid input, `2` means invalid user input, and `3` means a configuration or runtime failure. Expected failures do not print a stack trace or echo the rejected value.
