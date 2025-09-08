"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!nombre.trim() || !mensaje.trim()) {
      alert("Por favor, completa todos los campos.");
      return;
    }

    setLoading(true);

    try {
      // Buscar el último orden en "nuevo"
      const { data: pedidosExistentes, error: errorFetch } = await supabase
        .from("pedidos")
        .select("orden")
        .eq("estado", "nuevo")
        .order("orden", { ascending: false })
        .limit(1);

      if (errorFetch) throw errorFetch;

      const nuevoOrden =
        pedidosExistentes && pedidosExistentes.length > 0
          ? pedidosExistentes[0].orden + 1
          : 0;

      // Insertar nuevo pedido
      const { error: insertError } = await supabase.from("pedidos").insert([
        {
          nombre,
          mensaje,
          estado: "nuevo",
          orden: nuevoOrden,
        },
      ]);

      if (insertError) throw insertError;

      // Resetear formulario
      setNombre("");
      setMensaje("");

      alert("🙏 Pedido enviado con éxito.");
      router.push("/pedidos");
    } catch (err) {
      console.error("Error al enviar pedido:", err);
      alert("Hubo un error al enviar el pedido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50 p-6">
      <h1 className="text-3xl font-bold text-blue-700 mb-6">
        ✍️ Formulario de Pedido de Oración
      </h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl shadow-md w-full max-w-md"
      >
        <label className="block mb-4">
          <span className="text-gray-700">Nombre</span>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-lg p-2 
                       text-gray-900 font-medium placeholder-gray-400"
            placeholder="Escribe tu nombre"
          />
        </label>

        <label className="block mb-4">
          <span className="text-gray-700">Mensaje</span>
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-lg p-2 h-40 resize-none 
                       text-gray-900 font-medium placeholder-gray-400"
            placeholder="Escribe tu pedido de oración"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Enviando..." : "Enviar Pedido 🙏"}
        </button>
      </form>

      <button
        onClick={() => router.push("/pedidos")}
        className="mt-6 text-blue-600 hover:underline"
      >
        📖 Ver muro de pedidos
      </button>
    </div>
  );
}

