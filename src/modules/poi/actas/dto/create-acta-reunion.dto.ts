import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsDateString,
  MaxLength,
  IsMilitaryTime,
} from 'class-validator';
import { TipoReunion } from '../enums/acta.enum';

export class CreateActaReunionDto {
  @IsInt()
  proyectoId: number;

  @IsString()
  @MaxLength(20)
  codigo: string;

  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsDateString()
  fecha: string;

  @IsEnum(TipoReunion)
  tipoReunion: TipoReunion;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fasePerteneciente?: string;

  @IsOptional()
  @IsString()
  horaInicio?: string;

  @IsOptional()
  @IsString()
  horaFin?: string;

  @IsOptional()
  @IsArray()
  asistentes?: { nombre: string; cargo?: string; firma?: boolean }[];

  @IsOptional()
  @IsArray()
  ausentes?: { nombre: string; cargo?: string; motivo?: string }[];

  @IsOptional()
  @IsArray()
  agenda?: { numero: number; tema: string }[];

  @IsOptional()
  @IsArray()
  temasDesarrollados?: { tema: string; desarrollo: string }[];

  @IsOptional()
  @IsArray()
  acuerdos?: { numero: number; descripcion: string; responsable?: string; fechaLimite?: string }[];

  @IsOptional()
  @IsArray()
  proximosPasos?: { descripcion: string; responsable?: string; fecha?: string }[];

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  archivoUrl?: string;
}
