# Security Policy

## Supported Versions

OtakuList is an actively developed browser extension. Only the latest version
receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| older   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, report them privately using one of these channels:

- **GitHub Security Advisories** (preferred): open a report at
  **Security → Report a vulnerability** on this repository, or
- **Email:** **thandermughal@gmail.com**

Please include as much of the following as you can:

- The type of issue (e.g. data exposure, injection, permissions misuse)
- Which part is affected (the extension `content.js`/`background.js`, the
  companion web app, or the Supabase configuration)
- Steps to reproduce, and a proof-of-concept if possible
- The browser and version you tested on
- The potential impact

## What to expect

- We'll acknowledge your report as soon as we reasonably can.
- We'll investigate, keep you updated on progress, and let you know when a fix
  ships.
- Please give us a reasonable window to release a fix before any public
  disclosure. We're happy to credit you once the issue is resolved.

## Scope notes

- The anime watchlist is stored **locally** in the browser and is never
  uploaded; cover/identity lookups only query AniList's public API.
- The optional Gacha Showcase uses Supabase with Row-Level Security. Reports
  about auth, RLS, or data-exposure in the showcase are in scope.
- The **anon** Supabase key is public by design — data is protected by RLS, not
  by hiding the key. Reports that a public value is "exposed" without an actual
  RLS bypass are not considered vulnerabilities.

Thank you for helping keep OtakuList and its users safe. 🙏
