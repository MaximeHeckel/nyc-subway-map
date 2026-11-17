import Head from "next/head";
import SubwayMap from "@/features/SubwayMap";

export default function Home() {
  return (
    <>
      <Head>
        <title>NY Subway — ASCII transit map</title>
        <meta name="description" content="A live NYC subway map." />
        <meta property="og:description" content="A live NYC subway map." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <SubwayMap />
    </>
  );
}
