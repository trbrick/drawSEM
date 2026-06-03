import { md5 } from 'js-md5'

export async function computeMD5(data: string): Promise<string> {
  return md5(data)
}
