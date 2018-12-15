import { MagickFile, executeAndReturnOutputFile, asInputFile } from '../'
import { readFileAsText } from './file'
import { execute, ExecuteResult } from '../execute';
import { MagickInputFile } from '../magickApi';
import { getUniqueIdentifier } from '../executeVirtualCommand/uniqueName';
import { unquote } from './cli';
import { extractInfo } from './imageExtractInfo';
import { ShapeRepresentation, shapeTpDrawCommand } from './draw';

export async function getPixelColor(img: MagickFile, x: number, y: number): Promise<string> {
  const file = await executeAndReturnOutputFile({ inputFiles: [await asInputFile(img)], commands: `convert ${img.name} -format '%[pixel:p{${x},${y}}]\\n' info:info.txt` })
  const content = await readFileAsText(file)
  return content.trim()
}

/** given an image and a Shape it will "cut" the shape's region make it transparent and it will return both 
 * the modified image and the "cutted" image fragment (in a new image). It uses simple -compose CopyOpacity 
 * 
 */
export async function cutShape(image: MagickInputFile, r: ShapeRepresentation,
  outputFileName: string = getUniqueIdentifier() + '.miff',
  cutSectionFileName: string = getUniqueIdentifier() + '.miff',
  maskFileName: string = getUniqueIdentifier() + '.miff',
  executionId?: number)
  : Promise<{ modifiedFile: MagickFile, sectionFile: MagickFile, mask: MagickFile, results: ExecuteResult[] }> {

  const sizeResult = await extractInfo(image)
  const size = `${sizeResult[0].image.geometry.width}x${sizeResult[0].image.geometry.height}`
  const commands = `convert -alpha set -size '${size}' xc:white -fill black -draw '${shapeTpDrawCommand(r)}' ${maskFileName}`

  const result = await execute({
    inputFiles: [image],
    commands,
    executionId
  })
  const mask = await asInputFile(result.outputFiles.find(f => f.name === maskFileName))

  const result2 = await execute({
    inputFiles: [image, mask],
    commands: `convert ${image.name} ${mask.name} -alpha off  -compose CopyOpacity -composite ${outputFileName}`,
    executionId
  })
  const modifiedFile = result2.outputFiles.find(f => f.name === outputFileName)

  //also we want to copy the removed portion in image 3
  const result3 = await execute({
    inputFiles: [image, mask],
    commands: `convert ${image.name} ( ${mask.name} -negate )  -alpha off  -compose CopyOpacity -composite ${cutSectionFileName}`,
    executionId
  })
  const sectionFile = result3.outputFiles.find(f => f.name === cutSectionFileName)

  return {
    modifiedFile, sectionFile, mask, results: [result, result2, result3]
  }
}

/** it will append imageToPaste in given targetImage to given x,y position and optionally setting imageTpPaste size w,h. 
 * Returns the modified image with the paste operation done. 
 */
export async function paste(targetImage: MagickInputFile, imageToPaste: MagickInputFile, x: number, y: number,
  modifiedFileName: string = getUniqueIdentifier() + '.miff',
  w: number = 0, h: number = 0, executionId?:number)
  : Promise<{ modified: MagickFile, result: ExecuteResult }> {

  const commands =  `convert '${targetImage.name}' -gravity None -draw 'image over ${x},${y} ${w},${h} "${imageToPaste.name}"' '${modifiedFileName}'`
  const result = await execute({
    inputFiles: [imageToPaste, targetImage],
    commands, 
    executionId
  })
  const modified = result.outputFiles.find(f => f.name === modifiedFileName)
  return { modified, result }
}

