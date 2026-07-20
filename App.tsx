import React, { Suspense } from "react";
import { ActivityIndicator } from "react-native";

const BabylonLite = React.lazy(() => import("./babylon-lite"));


export default function App() {
  return (
    <Suspense fallback={<ActivityIndicator animating />}>
      <BabylonLite />
    </Suspense>
  );
}
