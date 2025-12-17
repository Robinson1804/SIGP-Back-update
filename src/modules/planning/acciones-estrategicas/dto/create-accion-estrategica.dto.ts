import { IsString, IsInt, IsOptional, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccionEstrategicaDto {
  @ApiProperty({
    description: 'ID del OEGD al que pertenece esta accion estrategica',
    example: 1,
  })
  @IsInt()
  oegdId: number;

  @ApiProperty({
    description: 'Codigo unico de la accion estrategica',
    example: 'AE-001',
    maxLength: 20,
  })
  @IsString()
  @MaxLength(20)
  codigo: string;

  @ApiProperty({
    description: 'Nombre de la accion estrategica',
    example: 'Desarrollo del modulo de reportes',
    maxLength: 300,
  })
  @IsString()
  @MaxLength(300)
  nombre: string;

  @ApiPropertyOptional({
    description: 'Descripcion detallada de la accion estrategica',
    example: 'Implementar el modulo de generacion de reportes con graficos y exportacion a PDF/Excel',
  })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({
    description: 'Indicador de cumplimiento de la accion',
    example: 'Porcentaje de funcionalidades implementadas',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  indicador?: string;

  @ApiPropertyOptional({
    description: 'Area responsable de la accion',
    example: 'Division de Sistemas',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  responsableArea?: string;

  @ApiPropertyOptional({
    description: 'Fecha de inicio de la accion (formato ISO 8601)',
    example: '2025-01-15',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiPropertyOptional({
    description: 'Fecha de fin de la accion (formato ISO 8601)',
    example: '2025-06-30',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
