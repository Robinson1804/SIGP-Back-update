import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsNumber,
  Matches,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { ProyectoEstado, Clasificacion } from '../enums/proyecto-estado.enum';

export class CreateProyectoDto {
  @IsString()
  @MaxLength(20)
  codigo: string;

  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsEnum(Clasificacion)
  clasificacion?: Clasificacion;

  @IsOptional()
  @IsInt()
  accionEstrategicaId?: number;

  @IsOptional()
  @IsInt()
  coordinadorId?: number;

  @IsOptional()
  @IsInt()
  scrumMasterId?: number;

  @IsOptional()
  @IsInt()
  patrocinadorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  coordinacion?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasFinancieras?: string[];

  @IsOptional()
  @IsNumber()
  montoAnual?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  anios?: number[];

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fechaInicio debe tener formato YYYY-MM-DD',
  })
  fechaInicio?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fechaFin debe tener formato YYYY-MM-DD',
  })
  fechaFin?: string;
}
