import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsDateString,
  IsNumber,
  MaxLength,
} from 'class-validator';

export class CreateActaConstitucionDto {
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

  @IsString()
  objetivoSmart: string;

  @IsString()
  alcance: string;

  @IsOptional()
  @IsString()
  fueraDeAlcance?: string;

  @IsOptional()
  @IsArray()
  entregables?: { nombre: string; descripcion?: string; fechaEstimada?: string }[];

  @IsOptional()
  @IsArray()
  riesgos?: { descripcion: string; impacto?: string; mitigacion?: string }[];

  @IsOptional()
  @IsNumber()
  presupuestoEstimado?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  archivoUrl?: string;
}
