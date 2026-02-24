import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HistoriaUsuario } from '../entities/historia-usuario.entity';
import { Tarea, EvidenciaTarea } from '../../tareas/entities';
import { TareaTipo } from '../../tareas/enums/tarea.enum';
import { MinioService } from '../../../storage/services/minio.service';
import { Archivo } from '../../../storage/entities/archivo.entity';
import axios from 'axios';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake/src/printer');

// Tipos básicos de pdfmake
type Content = any;
type TDocumentDefinitions = any;

// Usar fuentes estándar de PDF (no necesitan archivos externos)
const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

export interface TareaConEvidencias {
  tarea: Tarea;
  evidencias: EvidenciaTarea[];
}

// Cache para imágenes descargadas durante la generación del PDF
interface ImageCache {
  [url: string]: string; // url -> base64 data URI
}

@Injectable()
export class HuEvidenciaPdfService {
  private readonly logger = new Logger(HuEvidenciaPdfService.name);
  private printer: any;

  constructor(
    @InjectRepository(HistoriaUsuario)
    private readonly huRepository: Repository<HistoriaUsuario>,
    @InjectRepository(Tarea)
    private readonly tareaRepository: Repository<Tarea>,
    @InjectRepository(EvidenciaTarea)
    private readonly evidenciaRepository: Repository<EvidenciaTarea>,
    @InjectRepository(Archivo)
    private readonly archivoRepository: Repository<Archivo>,
    private readonly minioService: MinioService,
  ) {
    this.printer = new PdfPrinter(fonts);
  }

  /**
   * Genera el PDF consolidado de evidencias para una Historia de Usuario
   */
  async generateEvidenciasPdf(
    historiaUsuarioId: number,
    proyecto: { codigo: string; nombre: string },
    sprint?: { nombre: string } | null,
  ): Promise<Buffer> {
    // Obtener la HU con sus tareas y evidencias
    const hu = await this.huRepository.findOne({
      where: { id: historiaUsuarioId },
    });

    if (!hu) {
      throw new Error(`Historia de Usuario con ID ${historiaUsuarioId} no encontrada`);
    }

    // Obtener tareas SCRUM activas de la HU
    const tareas = await this.tareaRepository.find({
      where: {
        historiaUsuarioId,
        activo: true,
        tipo: TareaTipo.SCRUM,
      },
      relations: ['asignado'],
      order: { codigo: 'ASC' },
    });

    // Obtener evidencias para cada tarea
    const tareasConEvidencias: TareaConEvidencias[] = [];
    for (const tarea of tareas) {
      const evidencias = await this.evidenciaRepository.find({
        where: { tareaId: tarea.id },
        relations: ['usuario'],
        order: { createdAt: 'ASC' },
      });
      tareasConEvidencias.push({ tarea, evidencias });
    }

    return this.generatePdf(hu, proyecto, sprint, tareasConEvidencias);
  }

  private async generatePdf(
    hu: HistoriaUsuario,
    proyecto: { codigo: string; nombre: string },
    sprint: { nombre: string } | null | undefined,
    tareasConEvidencias: TareaConEvidencias[],
  ): Promise<Buffer> {
    // Pre-cargar todas las imágenes
    this.logger.log(`Precargando imágenes para HU ${hu.codigo}...`);
    const imageCache = await this.preloadImages(tareasConEvidencias);
    this.logger.log(`Se precargaron ${Object.keys(imageCache).length} imágenes`);

    // Derivar responsables únicos a partir de los asignados a las tareas
    const responsablesMap = new Map<number, string>();
    for (const { tarea } of tareasConEvidencias) {
      if (tarea.asignado) {
        responsablesMap.set(
          tarea.asignado.id,
          `${tarea.asignado.nombre} ${tarea.asignado.apellido}`.trim(),
        );
      }
    }
    const responsables = Array.from(responsablesMap.values());

    // Construir contenido estructurado
    const content: Content[] = [
      ...this.createPortadaContent(hu, proyecto, sprint, responsables, tareasConEvidencias),
      ...this.createTareasConImagenesContent(tareasConEvidencias, imageCache),
    ];

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 50, 40, 40],
      content,
      styles: this.getPdfStyles(),
      defaultStyle: { font: 'Helvetica', fontSize: 10 },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: `${proyecto.nombre}  |  ${hu.codigo} - ${hu.titulo}`,
            fontSize: 7,
            color: '#888888',
            margin: [40, 0, 0, 0],
          },
          {
            text: `Página ${currentPage} de ${pageCount}`,
            fontSize: 7,
            color: '#888888',
            alignment: 'right',
            margin: [0, 0, 40, 0],
          },
        ],
        margin: [0, 8, 0, 0],
      }),
    };

    return this.createPdfBuffer(docDefinition);
  }

  /**
   * Crea la portada del documento con toda la información de la HU
   */
  private createPortadaContent(
    hu: HistoriaUsuario,
    proyecto: { codigo: string; nombre: string },
    sprint: { nombre: string } | null | undefined,
    responsables: string[],
    tareasConEvidencias: TareaConEvidencias[],
  ): Content[] {
    const content: Content[] = [];

    // ── Encabezado INEI ──
    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                {
                  text: 'SISTEMA INTEGRAL DE GESTIÓN DE PROYECTOS — INEI',
                  fontSize: 8,
                  color: '#FFFFFF',
                  bold: true,
                  alignment: 'center',
                  margin: [0, 0, 0, 4],
                },
                {
                  text: 'INFORME DE EVIDENCIAS DE HISTORIA DE USUARIO',
                  fontSize: 14,
                  color: '#FFFFFF',
                  bold: true,
                  alignment: 'center',
                },
              ],
              fillColor: '#004272',
              margin: [0, 14, 0, 14],
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 20],
    });

    // ── Datos del Proyecto ──
    content.push({
      table: {
        widths: [110, '*', 90, '*'],
        body: [
          [
            { text: 'Proyecto:', bold: true, fontSize: 10 },
            { text: `${proyecto.codigo} — ${proyecto.nombre}`, fontSize: 10, colSpan: 3 },
            {},
            {},
          ],
          ...(sprint
            ? [
                [
                  { text: 'Sprint:', bold: true, fontSize: 10 },
                  { text: sprint.nombre, fontSize: 10 },
                  { text: 'Fecha de generación:', bold: true, fontSize: 10 },
                  { text: this.formatDate(new Date()), fontSize: 10 },
                ],
              ]
            : [
                [
                  { text: 'Fecha de generación:', bold: true, fontSize: 10 },
                  { text: this.formatDate(new Date()), fontSize: 10, colSpan: 3 },
                  {},
                  {},
                ],
              ]),
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 12],
    });

    // ── Separador ──
    content.push({
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: '#004272' },
      ],
      margin: [0, 0, 0, 14],
    });

    // ── Historia de Usuario ──
    content.push({ text: 'HISTORIA DE USUARIO', style: 'sectionTitle', margin: [0, 0, 0, 8] });

    const huRows: any[] = [
      [
        { text: 'Código:', bold: true, fontSize: 10 },
        { text: hu.codigo, fontSize: 10 },
        { text: 'Estado:', bold: true, fontSize: 10 },
        { text: (hu as any).estado || '-', fontSize: 10 },
      ],
      [
        { text: 'Título:', bold: true, fontSize: 10 },
        { text: hu.titulo, fontSize: 10, colSpan: 3 },
        {},
        {},
      ],
      [
        { text: 'Fecha Inicio:', bold: true, fontSize: 10 },
        { text: hu.fechaInicio ? this.formatDate(hu.fechaInicio) : 'No definida', fontSize: 10 },
        { text: 'Fecha Fin:', bold: true, fontSize: 10 },
        { text: hu.fechaFin ? this.formatDate(hu.fechaFin) : 'No definida', fontSize: 10 },
      ],
    ];

    if (hu.prioridad) {
      huRows.push([
        { text: 'Prioridad:', bold: true, fontSize: 10 },
        { text: hu.prioridad, fontSize: 10 },
        { text: 'Story Points:', bold: true, fontSize: 10 },
        { text: hu.storyPoints?.toString() || '-', fontSize: 10 },
      ]);
    }

    content.push({
      table: { widths: [110, '*', 90, '*'], body: huRows },
      layout: 'noBorders',
      margin: [0, 0, 0, 8],
    });

    // ── Responsables ──
    if (responsables.length > 0) {
      content.push({
        table: {
          widths: [110, '*'],
          body: [
            [
              { text: 'Responsables:', bold: true, fontSize: 10 },
              { text: responsables.join('   /   '), fontSize: 10 },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 14],
      });
    }

    // ── Separador ──
    content.push({
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' },
      ],
      margin: [0, 0, 0, 14],
    });

    // ── Tabla resumen de tareas ──
    content.push({ text: 'TAREAS', style: 'sectionTitle', margin: [0, 0, 0, 8] });

    const tareaHeaderRow = [
      { text: 'Código', fontSize: 9, bold: true, color: '#FFFFFF', fillColor: '#004272' },
      { text: 'Nombre', fontSize: 9, bold: true, color: '#FFFFFF', fillColor: '#004272' },
      { text: 'Responsable', fontSize: 9, bold: true, color: '#FFFFFF', fillColor: '#004272' },
      { text: 'Fecha Inicio', fontSize: 9, bold: true, color: '#FFFFFF', fillColor: '#004272' },
      { text: 'Fecha Fin', fontSize: 9, bold: true, color: '#FFFFFF', fillColor: '#004272' },
      { text: 'Estado', fontSize: 9, bold: true, color: '#FFFFFF', fillColor: '#004272' },
    ];

    const tareaDataRows = tareasConEvidencias.map(({ tarea }, idx) => [
      { text: tarea.codigo || '-', fontSize: 9, fillColor: idx % 2 === 0 ? '#f5f8fa' : null },
      { text: tarea.nombre, fontSize: 9, fillColor: idx % 2 === 0 ? '#f5f8fa' : null },
      {
        text: tarea.asignado
          ? `${tarea.asignado.nombre} ${tarea.asignado.apellido}`
          : 'Sin asignar',
        fontSize: 9,
        fillColor: idx % 2 === 0 ? '#f5f8fa' : null,
      },
      {
        text: tarea.fechaInicio ? this.formatDate(tarea.fechaInicio) : '-',
        fontSize: 9,
        fillColor: idx % 2 === 0 ? '#f5f8fa' : null,
      },
      {
        text: tarea.fechaFin ? this.formatDate(tarea.fechaFin) : '-',
        fontSize: 9,
        fillColor: idx % 2 === 0 ? '#f5f8fa' : null,
      },
      {
        text: tarea.estado || '-',
        fontSize: 9,
        fillColor: idx % 2 === 0 ? '#f5f8fa' : null,
      },
    ]);

    content.push({
      table: {
        headerRows: 1,
        widths: [52, '*', 90, 56, 56, 60],
        body: [tareaHeaderRow, ...tareaDataRows],
      },
      layout: {
        hLineWidth: (i: number, node: any) =>
          i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#cccccc',
        vLineColor: () => '#cccccc',
        paddingTop: () => 5,
        paddingBottom: () => 5,
        paddingLeft: () => 5,
        paddingRight: () => 5,
      },
      margin: [0, 0, 0, 10],
    });

    return content;
  }

  /**
   * Crea una sección por cada tarea: encabezado + info + imágenes de evidencia
   */
  private createTareasConImagenesContent(
    tareasConEvidencias: TareaConEvidencias[],
    imageCache: ImageCache,
  ): Content[] {
    const content: Content[] = [];
    let anyImage = false;

    for (const { tarea, evidencias } of tareasConEvidencias) {
      const imagenesDisponibles = evidencias.filter(
        (ev) => this.isImageFile(ev.tipo, ev.nombre) && ev.url && imageCache[ev.url],
      );

      if (imagenesDisponibles.length === 0) continue;

      anyImage = true;

      // Salto de página antes de cada tarea (separación clara)
      content.push({ text: '', pageBreak: 'before' });

      // Encabezado de la tarea
      content.push({
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: `${tarea.codigo}  —  ${tarea.nombre}`,
                fontSize: 11,
                bold: true,
                color: '#FFFFFF',
                fillColor: '#004272',
                margin: [6, 8, 6, 8],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 8],
      });

      // Info de la tarea: responsable, estado, fechas
      content.push({
        table: {
          widths: [95, '*', 85, '*'],
          body: [
            [
              { text: 'Responsable:', bold: true, fontSize: 9 },
              {
                text: tarea.asignado
                  ? `${tarea.asignado.nombre} ${tarea.asignado.apellido}`
                  : 'Sin asignar',
                fontSize: 9,
              },
              { text: 'Estado:', bold: true, fontSize: 9 },
              { text: tarea.estado || '-', fontSize: 9 },
            ],
            [
              { text: 'Fecha Inicio:', bold: true, fontSize: 9 },
              {
                text: tarea.fechaInicio ? this.formatDate(tarea.fechaInicio) : '-',
                fontSize: 9,
              },
              { text: 'Fecha Fin:', bold: true, fontSize: 9 },
              {
                text: tarea.fechaFin ? this.formatDate(tarea.fechaFin) : '-',
                fontSize: 9,
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 12],
      });

      // Imágenes de evidencia
      for (const ev of imagenesDisponibles) {
        content.push({
          stack: [
            {
              text: ev.nombre,
              fontSize: 8,
              italics: true,
              color: '#555555',
              margin: [0, 0, 0, 4],
            },
            {
              image: imageCache[ev.url!],
              width: 515,
              alignment: 'center',
              margin: [0, 0, 0, 14],
            },
          ],
        });
      }
    }

    if (!anyImage) {
      content.push({
        text: '\nNo hay imágenes de evidencia disponibles.',
        fontSize: 12,
        alignment: 'center',
        margin: [0, 50, 0, 0],
      });
    }

    return content;
  }

  /**
   * Estilos del documento PDF
   */
  private getPdfStyles(): Record<string, any> {
    return {
      sectionTitle: {
        fontSize: 11,
        bold: true,
        color: '#004272',
      },
      label: { fontSize: 9, bold: true },
      value: { fontSize: 9 },
      tableHeader: { fontSize: 9, bold: true, color: '#FFFFFF' },
      tableCell: { fontSize: 9 },
    };
  }

  /**
   * Crea el contenido del PDF solo con las imágenes embebidas, sin texto adicional
   */
  private createOnlyImagesContent(
    tareasConEvidencias: TareaConEvidencias[],
    imageCache: ImageCache,
  ): Content[] {
    const content: Content[] = [];
    let isFirstImage = true;

    for (const { evidencias } of tareasConEvidencias) {
      for (const ev of evidencias) {
        // Solo agregar imágenes que están en el cache
        if (this.isImageFile(ev.tipo, ev.nombre) && ev.url && imageCache[ev.url]) {
          // Page break antes de cada imagen excepto la primera
          if (!isFirstImage) {
            content.push({ text: '', pageBreak: 'before' });
          }
          isFirstImage = false;

          content.push({
            image: imageCache[ev.url],
            width: 555, // Ancho máximo en A4 con márgenes de 20
            alignment: 'center',
            margin: [0, 0, 0, 0],
          });
        }
      }
    }

    // Si no hay imágenes, agregar un mensaje
    if (content.length === 0) {
      content.push({
        text: 'No hay imágenes de evidencia disponibles.',
        fontSize: 12,
        alignment: 'center',
        margin: [0, 100, 0, 0],
      });
    }

    return content;
  }

  private createHuInfoSection(
    hu: HistoriaUsuario,
    sprint?: { nombre: string } | null,
  ): Content {
    return {
      stack: [
        { text: '1. INFORMACIÓN DE LA HISTORIA DE USUARIO', style: 'sectionTitle' },
        {
          table: {
            widths: [100, '*', 100, '*'],
            body: [
              [
                { text: 'Código:', style: 'label' },
                { text: hu.codigo, style: 'value' },
                { text: 'Sprint:', style: 'label' },
                { text: sprint?.nombre || 'Sin sprint', style: 'value' },
              ],
              [
                { text: 'Título:', style: 'label' },
                { text: hu.titulo, style: 'value', colSpan: 3 },
                {},
                {},
              ],
              [
                { text: 'Prioridad:', style: 'label' },
                { text: hu.prioridad || 'No definida', style: 'value' },
                { text: 'Story Points:', style: 'label' },
                { text: hu.storyPoints?.toString() || 'No definido', style: 'value' },
              ],
              [
                { text: 'Fecha Inicio:', style: 'label' },
                { text: hu.fechaInicio ? this.formatDate(hu.fechaInicio) : 'No definida', style: 'value' },
                { text: 'Fecha Fin:', style: 'label' },
                { text: hu.fechaFin ? this.formatDate(hu.fechaFin) : 'No definida', style: 'value' },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 10],
        },
        // Formato de Historia de Usuario
        {
          text: 'Descripción (Formato HU):',
          style: 'label',
          margin: [0, 5, 0, 5],
        },
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  stack: [
                    { text: `Como ${hu.rol || '[rol no definido]'}`, fontSize: 10, margin: [0, 0, 0, 3] },
                    { text: `Quiero ${hu.quiero || '[acción no definida]'}`, fontSize: 10, margin: [0, 0, 0, 3] },
                    { text: `Para ${hu.para || '[beneficio no definido]'}`, fontSize: 10 },
                  ],
                  margin: [10, 5, 10, 5],
                },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cccccc',
            vLineColor: () => '#cccccc',
          },
          margin: [0, 0, 0, 15],
        },
      ],
    };
  }

  private createTareasResumenSection(tareasConEvidencias: TareaConEvidencias[]): Content {
    const totalTareas = tareasConEvidencias.length;
    const totalEvidencias = tareasConEvidencias.reduce((sum, t) => sum + t.evidencias.length, 0);

    return {
      stack: [
        { text: '2. RESUMEN DE TAREAS Y EVIDENCIAS', style: 'sectionTitle' },
        {
          table: {
            widths: [80, '*'],
            body: [
              [
                { text: 'Total Tareas:', style: 'label' },
                { text: totalTareas.toString(), style: 'value' },
              ],
              [
                { text: 'Total Evidencias:', style: 'label' },
                { text: totalEvidencias.toString(), style: 'value' },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 10],
        },
        // Tabla resumen de tareas
        {
          table: {
            headerRows: 1,
            widths: [60, '*', 80, 60, 50],
            body: [
              [
                { text: 'Código', style: 'tableHeader' },
                { text: 'Nombre', style: 'tableHeader' },
                { text: 'Asignado', style: 'tableHeader' },
                { text: 'Estado', style: 'tableHeader' },
                { text: 'Evid.', style: 'tableHeader' },
              ],
              ...tareasConEvidencias.map(({ tarea, evidencias }) => [
                { text: tarea.codigo, style: 'tableCell' },
                { text: tarea.nombre, style: 'tableCell' },
                {
                  text: tarea.asignado
                    ? `${tarea.asignado.nombre} ${tarea.asignado.apellido}`
                    : 'Sin asignar',
                  style: 'tableCell',
                },
                { text: tarea.estado, style: 'tableCell' },
                { text: evidencias.length.toString(), style: 'tableCell', alignment: 'center' },
              ]),
            ],
          },
          layout: {
            hLineWidth: (i: number, node: any) =>
              i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cccccc',
            vLineColor: () => '#cccccc',
            paddingTop: () => 6,
            paddingBottom: () => 6,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          },
          margin: [0, 0, 0, 15],
        },
      ],
    };
  }

  private createEvidenciasDetalleSection(
    tareasConEvidencias: TareaConEvidencias[],
    imageCache: ImageCache = {},
  ): Content[] {
    const content: Content[] = [
      { text: '3. DETALLE DE EVIDENCIAS POR TAREA', style: 'sectionTitle' },
    ];

    for (const { tarea, evidencias } of tareasConEvidencias) {
      // Información de la tarea
      const tareaContent: Content[] = [
        {
          text: `${tarea.codigo} - ${tarea.nombre}`,
          style: 'tareaTitle',
        },
      ];

      // Descripción de la tarea
      if (tarea.descripcion) {
        tareaContent.push({
          text: tarea.descripcion,
          fontSize: 9,
          italics: true,
          margin: [0, 0, 0, 5],
        });
      }

      // Información del responsable y estado
      tareaContent.push({
        table: {
          widths: [80, '*', 80, '*'],
          body: [
            [
              { text: 'Responsable:', style: 'label' },
              {
                text: tarea.asignado
                  ? `${tarea.asignado.nombre} ${tarea.asignado.apellido}`
                  : 'Sin asignar',
                style: 'value',
              },
              { text: 'Estado:', style: 'label' },
              { text: tarea.estado, style: 'value' },
            ],
            [
              { text: 'Prioridad:', style: 'label' },
              { text: tarea.prioridad || 'No definida', style: 'value' },
              { text: 'Fecha Fin:', style: 'label' },
              {
                text: tarea.fechaFin ? this.formatDate(tarea.fechaFin) : 'No definida',
                style: 'value',
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 5, 0, 10],
      });

      // Tabla de evidencias
      tareaContent.push({
        text: `Evidencias (${evidencias.length}):`,
        fontSize: 10,
        bold: true,
        margin: [0, 5, 0, 5],
      });

      if (evidencias.length === 0) {
        tareaContent.push({
          text: 'No hay evidencias adjuntas para esta tarea.',
          fontSize: 9,
          italics: true,
          color: '#666666',
          margin: [10, 0, 0, 10],
        });
      } else {
        tareaContent.push({
          table: {
            headerRows: 1,
            widths: ['*', 80, 60, 100],
            body: [
              [
                { text: 'Archivo', style: 'tableHeader' },
                { text: 'Tipo', style: 'tableHeader' },
                { text: 'Tamaño', style: 'tableHeader' },
                { text: 'Subido por', style: 'tableHeader' },
              ],
              ...evidencias.map((ev) => [
                {
                  stack: [
                    { text: ev.nombre, style: 'tableCell', bold: true },
                    ev.descripcion
                      ? { text: ev.descripcion, style: 'tableCell', fontSize: 8, italics: true }
                      : { text: '' },
                  ],
                },
                { text: ev.tipo || 'No especificado', style: 'tableCell' },
                { text: this.formatFileSize(ev.tamanoBytes), style: 'tableCell' },
                {
                  stack: [
                    {
                      text: ev.usuario
                        ? `${ev.usuario.nombre} ${ev.usuario.apellido}`
                        : 'Desconocido',
                      style: 'tableCell',
                    },
                    { text: this.formatDate(ev.createdAt), style: 'tableCell', fontSize: 8 },
                  ],
                },
              ]),
            ],
          },
          layout: {
            hLineWidth: (i: number, node: any) =>
              i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cccccc',
            vLineColor: () => '#cccccc',
            paddingTop: () => 4,
            paddingBottom: () => 4,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          },
          margin: [0, 5, 0, 10],
        });

        // Agregar imágenes embebidas después de la tabla
        for (const ev of evidencias) {
          if (this.isImageFile(ev.tipo, ev.nombre) && ev.url && imageCache[ev.url]) {
            tareaContent.push({
              stack: [
                {
                  text: `📷 ${ev.nombre}`,
                  fontSize: 9,
                  bold: true,
                  color: '#004272',
                  margin: [0, 10, 0, 5],
                },
                ev.descripcion
                  ? { text: ev.descripcion, fontSize: 8, italics: true, margin: [0, 0, 0, 5] }
                  : { text: '' },
                {
                  image: imageCache[ev.url],
                  width: 400, // Ancho máximo de la imagen
                  alignment: 'center',
                  margin: [0, 0, 0, 10],
                },
                {
                  canvas: [
                    {
                      type: 'line',
                      x1: 0,
                      y1: 0,
                      x2: 515,
                      y2: 0,
                      lineWidth: 0.5,
                      lineColor: '#e0e0e0',
                    },
                  ],
                  margin: [0, 0, 0, 10],
                },
              ],
            });
          }
        }
      }

      content.push({
        stack: tareaContent,
        margin: [0, 0, 0, 15],
      });
    }

    return content;
  }

  private createFirmasSection(): Content {
    return {
      stack: [
        {
          text: 'VALIDACIÓN Y APROBACIÓN DE EVIDENCIAS',
          style: 'sectionTitle',
          alignment: 'center',
          margin: [0, 20, 0, 30],
        },
        {
          text: 'Este documento certifica que las evidencias adjuntas han sido revisadas y corresponden al trabajo realizado en la Historia de Usuario.',
          fontSize: 10,
          alignment: 'center',
          margin: [0, 0, 0, 40],
        },
        {
          columns: [
            {
              stack: [
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 }] },
                { text: 'Scrum Master', style: 'firmaLabel', margin: [0, 5, 0, 0] },
                { text: 'Nombre: _________________', fontSize: 9, margin: [0, 10, 0, 0] },
                { text: 'Fecha: _________________', fontSize: 9, margin: [0, 5, 0, 0] },
              ],
              width: '*',
              alignment: 'center',
            },
            {
              stack: [
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 }] },
                { text: 'Coordinador', style: 'firmaLabel', margin: [0, 5, 0, 0] },
                { text: 'Nombre: _________________', fontSize: 9, margin: [0, 10, 0, 0] },
                { text: 'Fecha: _________________', fontSize: 9, margin: [0, 5, 0, 0] },
              ],
              width: '*',
              alignment: 'center',
            },
          ],
          margin: [0, 0, 0, 40],
        },
        {
          columns: [
            { text: '', width: '*' },
            {
              stack: [
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 }] },
                { text: 'Patrocinador', style: 'firmaLabel', margin: [0, 5, 0, 0] },
                { text: 'Nombre: _________________', fontSize: 9, margin: [0, 10, 0, 0] },
                { text: 'Fecha: _________________', fontSize: 9, margin: [0, 5, 0, 0] },
              ],
              width: 180,
              alignment: 'center',
            },
            { text: '', width: '*' },
          ],
        },
      ],
    };
  }

  private formatDate(date: Date | string | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private formatFileSize(bytes: number | null): string {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Verifica si un archivo es una imagen basándose en su tipo o extensión
   */
  private isImageFile(tipo: string | null, nombre: string): boolean {
    const imageTypes = ['imagen', 'image'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

    if (tipo && imageTypes.some((t) => tipo.toLowerCase().includes(t))) {
      return true;
    }

    const extension = nombre.toLowerCase().substring(nombre.lastIndexOf('.'));
    return imageExtensions.includes(extension);
  }

  /**
   * Descarga una imagen desde una URL y la convierte a base64 para pdfmake
   */
  private async downloadImageAsBase64(url: string): Promise<string | null> {
    try {
      this.logger.log(`Intentando descargar: ${url}`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 segundos timeout
        maxContentLength: 10 * 1024 * 1024, // Max 10MB
      });

      const contentType = response.headers['content-type'] || 'image/jpeg';
      const base64 = Buffer.from(response.data).toString('base64');
      this.logger.log(`Descarga exitosa, contentType: ${contentType}, size: ${base64.length}`);
      return `data:${contentType};base64,${base64}`;
    } catch (error: any) {
      this.logger.error(`Error descargando imagen: ${url}`);
      this.logger.error(`Error details: ${error.message}`);
      if (error.response) {
        this.logger.error(`Status: ${error.response.status}`);
      }
      return null;
    }
  }

  /**
   * Extrae el UUID del archivo desde la URL de la API
   * URL format: http://localhost:3010/api/v1/archivos/{uuid}/download
   */
  private extractArchivoIdFromUrl(url: string): string | null {
    const match = url.match(/\/archivos\/([a-f0-9-]+)\/download/i);
    return match ? match[1] : null;
  }

  /**
   * Obtiene una URL presignada válida para descargar el archivo desde MinIO
   */
  private async getPresignedUrlForArchivo(archivoId: string): Promise<string | null> {
    try {
      const archivo = await this.archivoRepository.findOne({
        where: { id: archivoId },
      });

      if (!archivo) {
        this.logger.warn(`Archivo no encontrado: ${archivoId}`);
        return null;
      }

      // Obtener URL presignada de MinIO (válida por 1 hora)
      const presignedUrl = await this.minioService.getPresignedGetUrl(
        archivo.bucket,
        archivo.objectKey,
        3600, // 1 hora
      );

      return presignedUrl;
    } catch (error: any) {
      this.logger.error(`Error obteniendo URL presignada para ${archivoId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Pre-descarga todas las imágenes de las evidencias para usarlas en el PDF
   */
  private async preloadImages(
    tareasConEvidencias: TareaConEvidencias[],
  ): Promise<ImageCache> {
    const imageCache: ImageCache = {};

    for (const { tarea, evidencias } of tareasConEvidencias) {
      this.logger.log(`Tarea ${tarea.codigo}: ${evidencias.length} evidencias`);
      for (const ev of evidencias) {
        this.logger.log(`  Evidencia: ${ev.nombre}, tipo: ${ev.tipo}, url: ${ev.url ? 'SI' : 'NO'}`);
        const isImage = this.isImageFile(ev.tipo, ev.nombre);
        this.logger.log(`  Es imagen: ${isImage}`);

        if (isImage && ev.url) {
          // Extraer el ID del archivo de la URL de la API
          const archivoId = this.extractArchivoIdFromUrl(ev.url);
          this.logger.log(`  Archivo ID extraído: ${archivoId}`);

          if (archivoId) {
            // Obtener URL presignada desde MinIO
            const presignedUrl = await this.getPresignedUrlForArchivo(archivoId);

            if (presignedUrl) {
              this.logger.log(`  Descargando desde MinIO...`);
              const base64 = await this.downloadImageAsBase64(presignedUrl);
              if (base64) {
                // Guardar usando la URL original como clave
                imageCache[ev.url] = base64;
                this.logger.log(`  Imagen descargada OK`);
              } else {
                this.logger.warn(`  Error descargando imagen`);
              }
            }
          }
        }
      }
    }

    return imageCache;
  }

  private createPdfBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        const chunks: Buffer[] = [];

        pdfDoc.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        pdfDoc.on('end', () => {
          const result = Buffer.concat(chunks);
          resolve(result);
        });

        pdfDoc.on('error', (err: Error) => {
          reject(err);
        });

        pdfDoc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
