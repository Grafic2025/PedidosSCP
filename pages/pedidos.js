"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

/* -------------------------------- Helpers ------------------------------- */

function toNumberId(id) {
  return typeof id === "string" ? parseInt(id, 10) : id;
}

function nextOrdenParaEstado(estado, pedidos) {
  const existentes = pedidos.filter((p) => p.estado === estado);
  if (existentes.length === 0) return 0;
  return Math.max(...existentes.map((p) => p.orden ?? 0)) + 1;
}

/* --------------------------- Componentes UI ----------------------------- */

// Tarjeta de pedido: ahora también es "droppable" para permitir soltar sobre otra tarjeta
function PedidoCard({ pedido, onDelete, dragOverlay }) {
  // Droppable wrapper (id distinto para no colisionar con el draggable)
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `drop-${pedido.id}`,
  });

  // Draggable para arrastrar la tarjeta
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    transition,
    isDragging,
  } = useDraggable({ id: pedido.id.toString() });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    cursor: isDragging ? "grabbing" : "grab",
    boxShadow:
      isDragging || dragOverlay
        ? "0 10px 20px rgba(0,0,0,0.2)"
        : "0 1px 3px rgba(0,0,0,0.1)",
    zIndex: isDragging || dragOverlay ? 50 : "auto",
  };

  return (
    <div ref={setDroppableRef}>
      <div
        ref={setDraggableRef}
        style={style}
        {...attributes}
        {...listeners}
        className="bg-white shadow-md rounded-xl p-4 mb-4 select-none"
      >
        <h3 className="font-bold text-blue-600">{pedido.nombre}</h3>
        <p className="text-gray-700">{pedido.mensaje}</p>
        <p className="text-xs text-gray-400 mt-2">
          {new Date(pedido.created_at).toLocaleString()}
        </p>

        {!dragOverlay && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(pedido.id);
            }}
            className="mt-2 text-red-500 hover:text-red-700 text-sm"
          >
            🗑 Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

// Columna droppable
function Columna({ id, title, children }) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className="bg-gray-100 p-4 rounded-xl shadow-md min-h-[500px] max-h-[600px] overflow-y-auto relative"
    >
      <h2 className="text-xl font-semibold capitalize mb-4 text-center text-gray-700">
        {title}
      </h2>
      {children}
    </div>
  );
}

/* ------------------------------ Página --------------------------------- */

export default function Pedidos() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState([]);
  const [activePedido, setActivePedido] = useState(null);

  const estados = [
    { id: "nuevo", label: "🆕 Nuevos" },
    { id: "oracion", label: "🙏 En Oración" },
    { id: "contestado", label: "✅ Contestados" },
  ];

  // Evita drags accidentales (8px)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  useEffect(() => {
    fetchPedidos();

    // Realtime de Supabase
    const channel = supabase
      .channel("pedidos-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        () => {
          // Si notas parpadeos, podés debounc-ear esto
          fetchPedidos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchPedidos() {
    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .order("estado", { ascending: true })
      .order("orden", { ascending: true });

    if (error) {
      console.error("Error al obtener pedidos:", error);
      return;
    }
    setPedidos(data || []);
  }

  async function updateEstado(id, nuevoEstado, nuevoOrden = 0) {
    const idNum = toNumberId(id);

    const { error } = await supabase
      .from("pedidos")
      .update({ estado: nuevoEstado, orden: nuevoOrden })
      .eq("id", idNum);

    if (error) {
      console.error("Error al actualizar estado:", error);
      return;
    }

    // Actualización optimista del estado local
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === idNum ? { ...p, estado: nuevoEstado, orden: nuevoOrden } : p
      )
    );
  }

  async function updateOrdenes(columnaPedidos) {
    // 1) Recalcular orden en memoria
    const conOrden = columnaPedidos.map((p, index) => ({ ...p, orden: index }));

    // 2) Actualizar estado local
    setPedidos((prev) =>
      prev.map((p) => conOrden.find((c) => c.id === p.id) || p)
    );

    // 3) Persistir en Supabase
    const updates = conOrden.map((pedido) =>
      supabase
        .from("pedidos")
        .update({ orden: pedido.orden })
        .eq("id", pedido.id)
    );

    try {
      await Promise.all(updates);
    } catch (e) {
      console.error("Error al actualizar órdenes:", e);
    }
  }

  async function deletePedido(id) {
    const { error } = await supabase.from("pedidos").delete().eq("id", id);
    if (error) {
      console.error("Error al borrar pedido:", error);
      return;
    }
    setPedidos((prev) => prev.filter((p) => p.id !== id));
  }

  const handleDragStart = (event) => {
    const { active } = event;
    const pedido = pedidos.find((p) => p.id.toString() === active.id);
    setActivePedido(pedido || null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActivePedido(null);

    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    const esColumna = estados.some((e) => e.id === overId);
    const esTarjeta = overId.startsWith("drop-");
    const overPedidoId = esTarjeta ? overId.replace("drop-", "") : null;

    const pedido = pedidos.find((p) => p.id.toString() === activeId);
    if (!pedido) return;

    // 1) Soltó sobre una columna: mover a esa columna al final
    if (esColumna) {
      const nuevoEstado = overId;
      if (pedido.estado !== nuevoEstado) {
        const nuevoOrden = nextOrdenParaEstado(nuevoEstado, pedidos);
        await updateEstado(activeId, nuevoEstado, nuevoOrden);
      }
      return;
    }

    // 2) Soltó sobre otra tarjeta (drop-<id>)
    if (esTarjeta) {
      // Evitar operación redundante si se soltó sobre sí mismo
      if (overPedidoId === activeId) return;

      const overPedido = pedidos.find((p) => p.id.toString() === overPedidoId);
      if (!overPedido) return;

      const nuevoEstado = overPedido.estado;

      // 2.a) Cambia de columna: lo mando al final de la columna destino
      if (pedido.estado !== nuevoEstado) {
        const nuevoOrden = nextOrdenParaEstado(nuevoEstado, pedidos);
        await updateEstado(activeId, nuevoEstado, nuevoOrden);
        return;
      }

      // 2.b) Misma columna: reordenamiento
      const columnaPedidos = pedidos
        .filter((p) => p.estado === nuevoEstado)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

      const oldIndex = columnaPedidos.findIndex(
        (p) => p.id.toString() === activeId
      );
      const overIndex = columnaPedidos.findIndex(
        (p) => p.id.toString() === overPedidoId
      );

      if (oldIndex === -1 || overIndex === -1) return;

      const reordered = [...columnaPedidos];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(overIndex, 0, moved);

      await updateOrdenes(reordered);
    }
  };

  const handleDragCancel = () => {
    setActivePedido(null);
  };

  return (
    <div className="min-h-screen bg-blue-50 p-6">
      <button
        onClick={() => router.push("/")}
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        ← Volver al Formulario de Pedidos
      </button>

      <h1 className="text-3xl font-bold text-center text-blue-700 mb-6">
        📖 Muro de Pedidos de Oración
      </h1>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {estados.map((estado) => (
            <Columna key={estado.id} id={estado.id} title={estado.label}>
              {pedidos
                .filter((p) => p.estado === estado.id)
                .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                .map((pedido) => (
                  <PedidoCard
                    key={pedido.id}
                    pedido={pedido}
                    onDelete={deletePedido}
                  />
                ))}
            </Columna>
          ))}
        </div>

        <DragOverlay>
          {activePedido ? <PedidoCard pedido={activePedido} dragOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
