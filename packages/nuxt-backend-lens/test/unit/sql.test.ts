import { describe, expect, it } from 'vitest'
import { formatSql, tokenizeSql } from '../../src/runtime/ui/sql'
import { loadFixture } from './helpers'

const kinds = (sql: string) => tokenizeSql(sql).filter(token => token.type !== 'space').map(token => [token.type, token.text])

describe('tokenizeSql', () => {
  it('classifies keywords, identifiers, functions, literals and operators', () => {
    expect(kinds('SELECT count(*) as "aggregate" FROM "books" WHERE "rating" > 0.5 AND name = \'O\'\'Hara\' LIMIT ?')).toEqual([
      ['keyword', 'SELECT'],
      ['function', 'count'],
      ['punctuation', '('],
      ['operator', '*'],
      ['punctuation', ')'],
      ['keyword', 'as'],
      ['identifier', '"aggregate"'],
      ['keyword', 'FROM'],
      ['identifier', '"books"'],
      ['keyword', 'WHERE'],
      ['identifier', '"rating"'],
      ['operator', '>'],
      ['number', '0.5'],
      ['keyword', 'AND'],
      ['identifier', 'name'],
      ['operator', '='],
      ['string', '\'O\'\'Hara\''],
      ['keyword', 'LIMIT'],
      ['placeholder', '?'],
    ])
  })

  it('handles casts, comments, backticks and positional parameters', () => {
    expect(kinds('select `t`.`id`::text -- note\nfrom t where id = $1 /* x */')).toEqual([
      ['keyword', 'select'],
      ['identifier', '`t`'],
      ['punctuation', '.'],
      ['identifier', '`id`'],
      ['operator', '::'],
      ['identifier', 'text'],
      ['comment', '-- note'],
      ['keyword', 'from'],
      ['identifier', 't'],
      ['keyword', 'where'],
      ['identifier', 'id'],
      ['operator', '='],
      ['placeholder', '$1'],
      ['comment', '/* x */'],
    ])
  })

  it('is lossless on every query of the captured records, including unterminated input', () => {
    const { record } = loadFixture('clockwork', 'books-n-plus-one')
    for (const query of (record as { databaseQueries: { query: string }[] }).databaseQueries) {
      expect(tokenizeSql(query.query).map(token => token.text).join('')).toBe(query.query)
    }
    for (const broken of ['select \'unterminated', 'select "x', '/* open', 'a @ b']) {
      expect(tokenizeSql(broken).map(token => token.text).join('')).toBe(broken)
    }
  })
})

describe('formatSql', () => {
  it('lays a statement out over lines, preserving keyword case', async () => {
    expect(await formatSql('SELECT * FROM "authors" WHERE "authors"."id" = 20 LIMIT 1', { dialect: 'postgresql' }))
      .toBe('SELECT\n  *\nFROM\n  "authors"\nWHERE\n  "authors"."id" = 20\nLIMIT\n  1')
    expect(await formatSql('select 1', { dialect: 'sql' })).toBe('select\n  1')
  })

  it('falls back to the input when it cannot parse', async () => {
    expect(await formatSql('select (((', { dialect: 'sql' })).toBe('select (((')
    expect(await formatSql('anything', { dialect: 'no-such-dialect' })).toBe('anything')
  })
})
