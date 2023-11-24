import { mdxFromMarkdown } from 'mdast-util-mdx'
import { mdxjs } from 'micromark-extension-mdxjs'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { readFile, writeFile } from 'fs/promises'
import { walk } from '../utils/walk'
import { extname } from 'path'
import { Content } from 'mdast'
import { headingsSentenceCase } from './rules/headings-sentence-case'
import { LintError, LintRule } from './rules'
import { parseArgs } from 'node:util'

const args = parseArgs({
  options: {
    fix: {
      type: 'boolean',
      short: 'f',
    },
  },
  allowPositionals: true,
})

interface Rules {
  byType: Partial<Record<Content['type'], LintRule[]>>
}

const rules: Rules = {
  byType: {
    heading: [headingsSentenceCase()],
  },
}

interface FileErrors {
  file: string
  errors: LintError[]
}

function main() {
  const target = process.argv[2]

  lint(target)
}

async function lint(target: string) {
  const pages = await walk(target ?? 'pages')
  const errors: FileErrors[] = []

  const result = pages.map(async (page) => {
    if (extname(page.path) !== '.mdx') {
      return
    }

    const contents = await readFile(page.path, 'utf8')
    const localErrors: LintError[] = []

    const mdxTree = fromMarkdown(contents, {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown()],
    })

    mdxTree.children.forEach((child) => {
      if (rules.byType[child.type]) {
        rules.byType[child.type].forEach((rule) => {
          const result = rule.runRule(child, page.path)
          if (result.length) {
            localErrors.push(...result)
          }
        })
      }
    })

    if (localErrors.length) {
      errors.push({
        file: page.path,
        errors: localErrors,
      })
    }

    let newContents = contents.split('\n')

    localErrors.forEach((err) => {
      newContents[err.location.line - 1] =
        newContents[err.location.line - 1].substring(0, err.fix.start.column - 1) +
        err.fix.text +
        newContents[err.location.line - 1].substring(err.fix.start.column)
    })

    await writeFile(page.path, newContents.join('\n'), 'utf8')
  })

  await Promise.all(result)
}

main()
