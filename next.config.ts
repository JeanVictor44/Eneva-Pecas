import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Fotos e documentos são enviados via Server Action (multipart).
      // O padrão do Next é 1 MB, o que estoura com uma única foto de celular.
      // Aumentamos para acomodar várias fotos + documentos num mesmo envio.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
