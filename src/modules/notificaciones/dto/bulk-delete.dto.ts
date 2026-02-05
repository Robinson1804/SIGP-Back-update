import { IsArray, IsInt, ArrayMinSize } from 'class-validator';

export class BulkDeleteDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids: number[];
}

export class BulkDeleteProyectosDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  proyectoIds: number[];
}
