'use client';

import { useTrace24 } from '@/context/trace24-context';
import { Nav } from './nav';
import { HomeScreen } from './home-screen';
import { ScanScreen } from './scan-screen';
import { DashboardScreen } from './dashboard-screen';
import { ProjectScreen } from './project-screen';
import { ContractorScreen } from './contractor-screen';
import { GraphScreen } from './graph-screen';
import { AdminScreen } from './admin-screen';
import { InfoScreen } from './info-screen';
import { PricesScreen } from './prices-screen';

export function Trace24App() {
  const { page } = useTrace24();

  return (
    <>
      <Nav />
      {page === 'home' && <HomeScreen />}
      {page === 'scan' && <ScanScreen />}
      {page === 'dashboard' && <DashboardScreen />}
      {page === 'project' && <ProjectScreen />}
      {page === 'contractor' && <ContractorScreen />}
      {page === 'graph' && <GraphScreen />}
      {page === 'admin' && <AdminScreen />}
      {page === 'prices' && <PricesScreen />}
      {(page === 'method' ||
        page === 'sources' ||
        page === 'corrections' ||
        page === 'about') && <InfoScreen />}
    </>
  );
}
