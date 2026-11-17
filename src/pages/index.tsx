import Head from "next/head";
import SubwayMap from "@/features/SubwayMap";

export default function Home() {
  return (
    <>
      <Head>
        <title>NYC Subway ASCII Map - Maxime Heckel</title>
        <meta
          property="og:title"
          content="NYC Subway ASCII Map - Maxime Heckel"
        />
        <meta
          name="twitter:title"
          content="NYC Subway ASCII Map - Maxime Heckel"
        />
        <meta name="description" content="A live NYC subway map." />
        <meta property="og:description" content="A live NYC subway map." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <SubwayMap />
    </>
  );
}
