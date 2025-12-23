import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { TipoReunion, Modalidad } from '../enums/acta.enum';

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

  // Nuevos campos
  @IsOptional()
  @IsEnum(Modalidad)
  modalidad?: Modalidad;

  @IsOptional()
  @IsString()
  lugarLink?: string;

  @IsOptional()
  @IsInt()
  moderadorId?: number;

  @IsOptional()
  @IsDateString()
  proximaReunionFecha?: string;

  @IsOptional()
  @IsArray()
  asistentes?: {
    nombre: string;
    cargo?: string;
    organizacion?: string;
    esExterno?: boolean;
    esModerador?: boolean;
    usuarioId?: number;
  }[];

  @IsOptional()
  @IsArray()
  ausentes?: { nombre: string; cargo?: string; motivo?: string }[];

  @IsOptional()
  @IsArray()
  agenda?: { numero: number; tema: string }[];

  @IsOptional()
  @IsArray()
  temasDesarrollados?: {
    tema: string;
    notas?: string;
    conclusiones?: string;
  }[];

  @IsOptional()
  @IsArray()
  acuerdos?: {
    descripcion: string;
    responsables?: string[];
    responsableIds?: number[];
    fechaCompromiso?: string;
    prioridad?: 'Alta' | 'Media' | 'Baja';
  }[];

  @IsOptional()
  @IsArray()
  proximosPasos?: {
    descripcion: string;
    responsable?: string;
    responsableId?: number;
    fecha?: string;
  }[];

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsArray()
  anexosReferenciados?: { nombre: string; url?: string }[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  archivoUrl?: string;
}
