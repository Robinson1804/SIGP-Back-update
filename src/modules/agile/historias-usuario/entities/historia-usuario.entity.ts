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
import { HuPrioridad, HuEstimacion, HuEstado } from '../enums/historia-usuario.enum';
import { Proyecto } from '../../../poi/proyectos/entities/proyecto.entity';
import { Epica } from '../../epicas/entities/epica.entity';
import { Sprint } from '../../sprints/entities/sprint.entity';
import { Usuario } from '../../../auth/entities/usuario.entity';
import { CriterioAceptacion } from './criterio-aceptacion.entity';
import { HuDependencia } from './hu-dependencia.entity';

@Entity({ schema: 'agile', name: 'historias_usuario' })
export class HistoriaUsuario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'proyecto_id' })
  proyectoId: number;

  @Column({ name: 'epica_id', nullable: true })
  epicaId: number;

  @Column({ name: 'sprint_id', nullable: true })
  sprintId: number | null;

  @Column({ length: 20 })
  codigo: string;

  @Column({ length: 200 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  rol: string;

  @Column({ type: 'text', nullable: true })
  quiero: string;

  @Column({ type: 'text', nullable: true })
  para: string;

  @Column({
    type: 'enum',
    enum: HuPrioridad,
    default: HuPrioridad.SHOULD,
  })
  prioridad: HuPrioridad;

  @Column({
    type: 'enum',
    enum: HuEstimacion,
    nullable: true,
  })
  estimacion: HuEstimacion;

  @Column({ name: 'story_points', type: 'int', nullable: true })
  storyPoints: number;

  @Column({
    type: 'enum',
    enum: HuEstado,
    default: HuEstado.PENDIENTE,
  })
  estado: HuEstado;

  @Column({ name: 'asignado_a', nullable: true })
  asignadoA: number | null;

  @Column({ name: 'orden_backlog', type: 'int', nullable: true })
  ordenBacklog: number;

  @Column({ type: 'text', nullable: true })
  notas: string;

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

  @ManyToOne(() => Epica, { nullable: true })
  @JoinColumn({ name: 'epica_id' })
  epica: Epica;

  @ManyToOne(() => Sprint, { nullable: true })
  @JoinColumn({ name: 'sprint_id' })
  sprint: Sprint;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'asignado_a' })
  asignado: Usuario;

  @OneToMany(() => CriterioAceptacion, (criterio) => criterio.historiaUsuario)
  criteriosAceptacion: CriterioAceptacion[];

  @OneToMany(() => HuDependencia, (dep) => dep.historiaUsuario)
  dependencias: HuDependencia[];
}
