import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";

const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 bg-background min-h-screen">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
