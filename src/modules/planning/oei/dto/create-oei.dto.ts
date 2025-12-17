import {
  IsString,
  IsInt,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MetaAnualDto {
  @ApiProperty({
    description: 'Año de la meta',
    example: 2025,
    minimum: 2000,
  })
  @IsInt()
  @Min(2000)
  anio: number;

  @ApiProperty({
    description: 'Valor de la meta para el año',
    example: 100,
  })
  @IsNumber()
  meta: number;

  @ApiPropertyOptional({
    description: 'Valor logrado hasta el momento',
    example: 45.5,
  })
  @IsOptional()
  @IsNumber()
  logrado?: number;
}

export class CreateOeiDto {
  @ApiProperty({
    description: 'ID del PGD al que pertenece este OEI',
    example: 1,
  })
  @IsInt()
  pgdId: number;

  @ApiProperty({
    description: 'Codigo unico del OEI',
    example: 'OEI-001',
    maxLength: 20,
  })
  @IsString()
  @MaxLength(20)
  codigo: string;

  @ApiProperty({
    description: 'Nombre del Objetivo Estrategico Institucional',
    example: 'Modernizar los procesos de gestion institucional',
    maxLength: 300,
  })
  @IsString()
  @MaxLength(300)
  nombre: string;

  @ApiPropertyOptional({
    description: 'Descripcion detallada del OEI',
    example: 'Implementar mejoras en los procesos administrativos para aumentar la eficiencia operativa',
  })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({
    description: 'Indicador de medicion del OEI',
    example: 'Porcentaje de procesos modernizados',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  indicador?: string;

  @ApiPropertyOptional({
    description: 'Valor de linea base para el indicador',
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  lineaBase?: number;

  @ApiPropertyOptional({
    description: 'Unidad de medida del indicador',
    example: 'Porcentaje',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unidadMedida?: string;

  @ApiPropertyOptional({
    description: 'Metas anuales del OEI',
    type: [MetaAnualDto],
    example: [
      { anio: 2025, meta: 40 },
      { anio: 2026, meta: 60 },
      { anio: 2027, meta: 80 },
      { anio: 2028, meta: 100 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaAnualDto)
  metasAnuales?: MetaAnualDto[];
}
