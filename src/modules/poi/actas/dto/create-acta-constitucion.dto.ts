import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsDateString,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateActaConstitucionDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  objetivoSmart?: string;

  // Nuevos campos
  @IsOptional()
  @IsString()
  justificacion?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => value)
  alcance?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => value)
  fueraDeAlcance?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => value)
  entregables?: {
    nombre: string;
    descripcion?: string;
    fechaEstimada?: string;
  }[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => value)
  supuestos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => value)
  restricciones?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => value)
  riesgos?: {
    descripcion: string;
    probabilidad?: 'Alta' | 'Media' | 'Baja';
    impacto?: 'Alto' | 'Medio' | 'Bajo';
    mitigacion?: string;
  }[];

  @IsOptional()
  @IsNumber()
  presupuestoEstimado?: number;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => value)
  cronogramaHitos?: {
    nombre: string;
    fechaEstimada: string;
    descripcion?: string;
  }[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => value)
  equipoProyecto?: {
    rol: string;
    nombre: string;
    responsabilidad?: string;
    usuarioId?: number;
  }[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  archivoUrl?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
