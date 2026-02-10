import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SprintEstado } from '../enums/sprint.enum';
import { Proyecto } from '../../../poi/proyectos/entities/proyecto.entity';
import { Subproyecto } from '../../../poi/subproyectos/entities/subproyecto.entity';
import { DateOnlyTransformer } from '../../../../common/transformers/date.transformer';

@Entity({ schema: 'agile', name: 'sprints' })
export class Sprint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'proyecto_id', nullable: true })
  proyectoId?: number;

  @Column({ name: 'subproyecto_id', nullable: true })
  subproyectoId?: number;

  @Column({ length: 100 })
  nombre: string;

  @Column({ name: 'sprint_goal', type: 'text', nullable: true })
  sprintGoal: string;

  @Column({ name: 'fecha_inicio', type: 'date', nullable: true, transformer: DateOnlyTransformer })
  fechaInicio: string | null;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true, transformer: DateOnlyTransformer })
  fechaFin: string | null;

  @Column({ name: 'capacidad_equipo', type: 'int', nullable: true })
  capacidadEquipo: number;

  @Column({
    type: 'enum',
    enum: SprintEstado,
    default: SprintEstado.POR_HACER,
  })
  estado: SprintEstado;

  @Column({ name: 'link_evidencia', length: 500, nullable: true })
  linkEvidencia: string;

  @Column({ name: 'fecha_inicio_real', type: 'timestamp', nullable: true })
  fechaInicioReal: Date;

  @Column({ name: 'fecha_fin_real', type: 'timestamp', nullable: true })
  fechaFinReal: Date;

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
  @ManyToOne(() => Proyecto, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proyecto_id' })
  proyecto?: Proyecto;

  @ManyToOne(() => Subproyecto, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subproyecto_id' })
  subproyecto?: Subproyecto;
}
