import { IsString, IsInt, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOegdDto {
  @ApiProperty({
    description: 'ID del OGD al que pertenece este OEGD',
    example: 1,
  })
  @IsInt()
  ogdId: number;

  @ApiProperty({
    description: 'Codigo unico del OEGD',
    example: 'OEGD-001',
    maxLength: 20,
  })
  @IsString()
  @MaxLength(20)
  codigo: string;

  @ApiProperty({
    description: 'Nombre del Objetivo Especifico de Gestion Divisional',
    example: 'Implementar sistema de seguimiento de proyectos',
    maxLength: 300,
  })
  @IsString()
  @MaxLength(300)
  nombre: string;

  @ApiPropertyOptional({
    description: 'Descripcion detallada del OEGD',
    example: 'Desarrollar e implementar un sistema que permita el monitoreo en tiempo real de los proyectos',
  })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({
    description: 'Indicador de medicion del OEGD',
    example: 'Numero de proyectos con seguimiento activo',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  indicador?: string;
}
