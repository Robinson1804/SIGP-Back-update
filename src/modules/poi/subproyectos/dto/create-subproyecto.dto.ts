import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateSubproyectoDto {
  @IsInt()
  proyectoPadreId: number;

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
  @IsNumber()
  monto?: number;

  @IsOptional()
  @IsInt()
  scrumMasterId?: number;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
