import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsDateString,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  alcance?: string[];

  @IsOptional()
  @IsArray()
  fueraDeAlcance?: string[];

  @IsOptional()
  @IsArray()
  @Type(() => Object)
  entregables?: {
    nombre: string;
    descripcion?: string;
    fechaEstimada?: string;
  }[];

  @IsOptional()
  @IsArray()
  supuestos?: string[];

  @IsOptional()
  @IsArray()
  restricciones?: string[];

  @IsOptional()
  @IsArray()
  @Type(() => Object)
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
  @Type(() => Object)
  cronogramaHitos?: {
    nombre: string;
    fechaEstimada: string;
    descripcion?: string;
  }[];

  @IsOptional()
  @IsArray()
  @Type(() => Object)
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
