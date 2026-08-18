# dsh-composer-skill-mention

English | [中文](README.zh.md)

Codex-style Skill mentions for the DeepSeek Harness Web composer.

Verified with `@deepseek-ai/dsh@0.1.0-rc.6`.

## What it does

Type `$` or the fullwidth yuan sign `￥` (U+FFE5) in the composer to filter Skills that are available to the current session. Picking a candidate inserts canonical `$skill-name ` text. Before the Agent step starts, the host loads that Skill's body through DSH's Skill registry and injects it as `skill-invocation` context.

`$dis` and `￥dis` open the same candidate list. After a pick, the draft always stores `$skill-name `, not the fullwidth trigger. Typing or pasting `$skill-name` or `￥skill-name` has the same host meaning.

![Skill mention candidates](screenshots/mention.png)

## Behavior

- Only kebab-case Skill names that sit at the start of a direct user message, or after whitespace, are treated as mentions.
- The plugin asks the session Skill catalog for candidates and reuses DSH `renderSkillContent()` for the injected body.
- Unknown Skills, and Skills the user is not allowed to invoke, stay ordinary text.
- `/name`, `$name`, and `￥name` in the same message inject the Skill body once.
- `$HOME`, `foo$bar`, `$foo/bar`, `\$name`, and halfwidth `¥name` are not Skill mentions.
- The plugin does not run a shell and does not write local `SKILL.md` paths into the message.

## Verification

The compatibility boundary and verification evidence are recorded in the [design document](https://github.com/SisyphusSQ/dsh-plugins/blob/main/docs/design/dsh-composer-skill-mention.md). The current compatibility baseline is `@deepseek-ai/dsh@0.1.0-rc.6`.

## License

MIT. rc.6 composer routing notes: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
