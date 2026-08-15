/**
 * Vendored SKILL.md parser tests (equivalence with dsh-skill-filesystem).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillFile, isSkillName } from '../lib/vendor/parse-skill-file.js'

test('parses a valid skill with optional fields', () => {
  const raw = `---
name: my-skill
description: Does things
whenToUse: When the user asks for things
metadata:
  cost: low
user-invocable: true
---
# Body

Some instructions.
`
  const parsed = parseSkillFile(raw)
  assert.equal(parsed?.name, 'my-skill')
  assert.equal(parsed?.description, 'Does things')
  assert.equal(parsed?.whenToUse, 'When the user asks for things')
  assert.deepEqual(parsed?.metadata, { cost: 'low' })
  assert.deepEqual(parsed?.invocation, { modelInvocable: true, userInvocable: true })
  assert.equal(parsed?.content, '# Body\n\nSome instructions.')
})

test('disable-model-invocation flips the policy', () => {
  const parsed = parseSkillFile('---\nname: x\ndescription: y\ndisable-model-invocation: true\n---\nbody')
  assert.equal(parsed?.invocation.modelInvocable, false)
  assert.equal(parsed?.invocation.userInvocable, true)
})

test('user-invocable: false excludes the user surface', () => {
  const parsed = parseSkillFile('---\nname: x\ndescription: y\nuser-invocable: "no"\n---\nbody')
  assert.equal(parsed?.invocation.userInvocable, false)
})

test('missing frontmatter is skipped', () => {
  assert.equal(parseSkillFile('# just a heading'), undefined)
})

test('frontmatter without closing marker is skipped', () => {
  assert.equal(parseSkillFile('---\nname: x\n'), undefined)
})

test('missing name or description is skipped', () => {
  assert.equal(parseSkillFile('---\nname: x\n---\nbody'), undefined)
  assert.equal(parseSkillFile('---\ndescription: x\n---\nbody'), undefined)
})

test('invalid skill name is skipped', () => {
  assert.equal(parseSkillFile('---\nname: Bad Name\ndescription: x\n---\nbody'), undefined)
  assert.equal(parseSkillFile('---\nname: a..b\ndescription: x\n---\nbody'), undefined)
})

test('legacy invocation keys are rejected', () => {
  assert.equal(parseSkillFile('---\nname: x\ndescription: y\nmodelInvocable: false\n---\nbody'), undefined)
  assert.equal(parseSkillFile('---\nname: x\ndescription: y\nuserInvocable: false\n---\nbody'), undefined)
})

test('non-object frontmatter is skipped', () => {
  assert.equal(parseSkillFile('---\n- a\n- b\n---\nbody'), undefined)
})

test('unknown fields are ignored', () => {
  const parsed = parseSkillFile('---\nname: x\ndescription: y\nwhatever: 42\n---\nbody')
  assert.equal(parsed?.name, 'x')
})

test('CRLF frontmatter delimiters are accepted', () => {
  const parsed = parseSkillFile('---\r\nname: x\r\ndescription: y\r\n---\r\nbody')
  assert.equal(parsed?.name, 'x')
})

test('isSkillName kebab-case constraint', () => {
  assert.equal(isSkillName('skill-a'), true)
  assert.equal(isSkillName('a'), true)
  assert.equal(isSkillName('SkillA'), false)
  assert.equal(isSkillName('skill_a'), false)
  assert.equal(isSkillName('a-b-c'), true)
})
