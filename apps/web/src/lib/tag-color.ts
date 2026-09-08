export type TagTone = 'green' | 'yellow' | 'blue' | 'red' | 'gray'

/** 프로필 색상을 시안 파스텔 톤 중 하나로 매핑한다 */
export function toneForColor(color: string | undefined): TagTone {
  if (!color) return 'gray'
  const value = color.trim().replace(/^#/, '')
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return 'gray'
  const hex = value.length === 3 ? value.split('').map((part) => part + part).join('') : value
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return 'gray'
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  if (saturation < 0.15 || lightness > 0.9 || lightness < 0.1) return 'gray'

  let hue = 0
  if (max === red) hue = 60 * (((green - blue) / delta) % 6)
  else if (max === green) hue = 60 * ((blue - red) / delta + 2)
  else hue = 60 * ((red - green) / delta + 4)
  if (hue < 0) hue += 360

  const anchors: Array<[TagTone, number]> = [['red', 1], ['yellow', 40], ['green', 125], ['blue', 204]]
  return anchors.reduce((nearest, current) => {
    const currentDistance = Math.min(Math.abs(hue - current[1]), 360 - Math.abs(hue - current[1]))
    const nearestDistance = Math.min(Math.abs(hue - nearest[1]), 360 - Math.abs(hue - nearest[1]))
    return currentDistance < nearestDistance ? current : nearest
  })[0]
}

/** 'tag tag-blue' 형태의 클래스명을 만든다 */
export function tagClassName(tone: TagTone): string {
  return `tag tag-${tone}`
}
