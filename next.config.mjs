/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  productionBrowserSourceMaps: false,
  // Serve o handler de auth do Firebase no nosso domínio. Com o authDomain
  // padrão (intento-saas.firebaseapp.com), o WebKit particiona o storage do
  // iframe de terceiro e o signInWithRedirect falha ("missing initial state")
  // — o que quebra o login Google no PWA instalado (iOS), onde popup não
  // funciona. Só tem efeito quando NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN apontar
  // pro domínio da plataforma (mentoria.metodointento.com.br).
  async rewrites() {
    return [
      { source: '/__/auth/:path*', destination: 'https://intento-saas.firebaseapp.com/__/auth/:path*' },
      { source: '/__/firebase/:path*', destination: 'https://intento-saas.firebaseapp.com/__/firebase/:path*' },
    ];
  },
  experimental: {
    optimizePackageImports: [
      'chart.js',
      'react-chartjs-2',
      'firebase',
      'firebase/auth',
    ],
  },
};

export default nextConfig;
