import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsDateString,
  MaxLength,
  IsNotEmpty,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoReunion, Modalidad } from '../enums/acta.enum';
// Nota: fasePerteneciente, horaInicio, horaFin, modalidad son opcionales para
// permitir guardar borradores antes de tener todos los datos completos.

export class CreateActaReunionDto {
  @IsOptional()
  @IsInt()
  proyectoId?: number;

  @IsOptional()
  @IsInt()
  subproyectoId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigo?: string;

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

  @IsNotEmpty({ message: 'Debe incluir al menos un asistente' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un asistente' })
  @Type(() => Object)
  asistentes: {
    nombre: string;
    cargo?: string;
    organizacion?: string;
    esExterno?: boolean;
    esModerador?: boolean;
    usuarioId?: number;
  }[];

  @IsOptional()
  @IsArray()
  @Type(() => Object)
  ausentes?: { nombre: string; cargo?: string; motivo?: string }[];

  @IsNotEmpty({ message: 'La agenda es obligatoria' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un tema en la agenda' })
  @Type(() => Object)
  agenda: { numero?: number; tema: string; descripcion?: string }[];

  @IsNotEmpty({ message: 'Los temas desarrollados son obligatorios' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un tema desarrollado' })
  @Type(() => Object)
  temasDesarrollados: {
    tema: string;
    notas?: string;
    conclusiones?: string;
  }[];

  @IsNotEmpty({ message: 'Los acuerdos son obligatorios' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un acuerdo' })
  @Type(() => Object)
  acuerdos: {
    descripcion: string;
    responsables?: string[];
    responsableIds?: number[];
    fechaCompromiso?: string;
    prioridad?: 'Alta' | 'Media' | 'Baja';
  }[];

  @IsOptional()
  @IsArray()
  @Type(() => Object)
  proximosPasos?: {
    descripcion: string;
    responsable?: string;
    responsableNombre?: string;
    responsableId?: number;
    fecha?: string;
    fechaLimite?: string;
  }[];

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsArray()
  @Type(() => Object)
  anexosReferenciados?: { nombre: string; url?: string; descripcion?: string }[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  archivoUrl?: string;
}
