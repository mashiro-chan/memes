import type { AxiosError } from 'axios'
import type { Context } from 'koishi'
import { Schema, h } from 'koishi'

export const name = 'memes'

export interface Config {
  name: string
  endpoint: string
  memes: {
    key: string
    name: string
  }[]
}

export const Config: Schema<Config> = Schema.object({
  name: Schema.string().required(),
  endpoint: Schema.string().default('http://127.0.0.1:2233'),
  memes: Schema.array(
    Schema.object({
      key: Schema.string(),
      name: Schema.string(),
    }),
  )
    .default([])
    .role('table'),
})

export interface MemeInfo {
  key: string
  keywords: string[]
  patterns: unknown[]
  params: {
    min_images: number
    max_images: number
    min_texts: number
    max_texts: number
    default_texts: string[]
    args: {
      name: string
      type: string
      description: string
      default: string
    }[]
  }
}

export async function apply(ctx: Context, config: Config) {
  if (!config.memes?.length) return

  const l = ctx.logger('m6c/memes')

  if (config.endpoint.endsWith('/'))
    config.endpoint = config.endpoint.slice(0, config.endpoint.length - 1)

  for (const item of config.memes) {
    const { key: meme, name: memeName } = item
    try {
      const info: MemeInfo = await ctx.http.get(
        `${config.endpoint}/memes/${meme}/info`,
      )

      const cmdName = `memegen-${meme.toLowerCase().replaceAll('_', '-')}`

      const cmd = ctx.command(
        `${cmdName} ${[...Array(info.params.min_images).keys()]
          .map((x) => `<图片${x + 1}:string>`)
          .join(' ')} ${[...Array(info.params.min_texts).keys()]
          .map((x) => `<文本${x + 1}:string>`)
          .join(' ')} ${[
          ...Array(info.params.max_images - info.params.min_images).keys(),
        ]
          .map((x) => `[可选图片${x + 1}:string]`)
          .join(' ')} ${[
          ...Array(info.params.max_texts - info.params.min_texts).keys(),
        ]
          .map((x) => `[可选文本${x + 1}:string]`)
          .join(' ')}`,
        `生成${memeName}图片`,
      )

      if (meme !== memeName) cmd.alias(memeName)

      const example = `@${config.name} /${memeName} ${info.params.default_texts
        .map((x) => `"${x}"`)
        .join(' ')}`

      cmd.example(example)

      for (const arg of info.params.args)
        cmd.option(arg.name, `[value:string] ${arg.description}`, {
          fallback: undefined,
        })

      cmd.action(async ({ session, options }, ...args) => {
        try {
          if (!args.length) {
            // 未提供任何参数，输出示例图片
            const result = await ctx.http.axios({
              url: `${config.endpoint}/memes/${meme}/preview`,
              method: 'GET',
              responseType: 'arraybuffer',
            })

            await session.send(
              h.image(
                result.data as Buffer,
                (result.headers['Content-Type'] as string) || 'image/png',
              ),
            )

            // 图片输出后，显示帮助
            return session.execute(`help ${cmdName}`)
          }

          // TODO：将图片参数解析为图片

          const data = new FormData()
          args.forEach((x) => data.append('texts', x))
          if (Object.entries(options).filter((x) => x[1]).length)
            data.append('args', JSON.stringify(options))

          const result = await ctx.http.axios({
            url: `${config.endpoint}/memes/${meme}`,
            method: 'POST',
            data,
            responseType: 'arraybuffer',
          })

          return h.image(
            result.data as Buffer,
            (result.headers['Content-Type'] as string) || 'image/png',
          )
        } catch (e) {
          if ((e as AxiosError).response?.data) {
            const err = (e as AxiosError<Buffer>).response.data.toString()
            if (!err.includes('ParamsMismatch')) l.warn(err)
          } else l.warn(e)
          void session.send(
            `生成图片失败，请检查输入格式哦~使用示例：\n${example}`,
          )
        }
      })
    } catch (e) {
      l.warn(`Meme ${meme} load failed:`)
      l.warn(e)
      return
    }
  }

  l.success(`${config.memes.length} meme(s) loaded.`)
}
