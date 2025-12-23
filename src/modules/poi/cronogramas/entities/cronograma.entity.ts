import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { CronogramaEstado } from '../enums/cronograma.enum';
import { Proyecto } from '../../proyectos/entities/proyecto.entity';
import { TareaCronograma } from './tarea-cronograma.entity';
import { DependenciaCronograma } from './dependencia-cronograma.entity';

@Entity({ schema: 'poi', name: 'cronogramas' })
export class Cronograma {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'proyecto_id' })
  proyectoId: number;

  @Column({ length: 20 })
  codigo: string;

  @Column({ length: 200 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ type: 'int', nullable: true })
  version: number;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio: Date;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin: Date;

  @Column({
    type: 'enum',
    enum: CronogramaEstado,
    default: CronogramaEstado.BORRADOR,
  })
  estado: CronogramaEstado;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null | undefined;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null | undefined;

  // Relations
  @ManyToOne(() => Proyecto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proyecto_id' })
  proyecto: Proyecto;

  @OneToMany(() => TareaCronograma, (tarea) => tarea.cronograma)
  tareas: TareaCronograma[];

  @OneToMany(() => DependenciaCronograma, (dep) => dep.cronograma)
  dependencias: DependenciaCronograma[];
}
