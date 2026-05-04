import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client.js';

export function useDemoStatus() {
  return useQuery({
    queryKey: ['demo-status'],
    queryFn: async () => {
      const { data } = await api.get('/demo/status');
      return data;
    },
    refetchInterval: 5000, // Poll every 5s to keep UI updated
  });
}

export function useDemoDashboard() {
  return useQuery({
    queryKey: ['demo-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/demo/dashboard');
      return data.dashboard;
    },
    refetchInterval: 10000,
  });
}

export function useDemoPredictions() {
  return useQuery({
    queryKey: ['demo-predictions'],
    queryFn: async () => {
      const { data } = await api.get('/demo/predictions');
      return data.data;
    },
  });
}

export function useDemoControls() {
  const queryClient = useQueryClient();

  const activateDemo = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/demo/activate');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-status'] });
      queryClient.invalidateQueries({ queryKey: ['demo-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['demo-predictions'] });
    },
  });

  const deactivateDemo = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/demo/deactivate');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-status'] });
    },
  });

  const activateKillSwitch = useMutation({
    mutationFn: async (reason) => {
      const { data } = await api.post('/demo/killswitch/activate', { reason });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-status'] });
      queryClient.invalidateQueries({ queryKey: ['demo-dashboard'] });
    },
  });

  const deactivateKillSwitch = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/demo/killswitch/deactivate');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-status'] });
      queryClient.invalidateQueries({ queryKey: ['demo-dashboard'] });
    },
  });

  return {
    activateDemo,
    deactivateDemo,
    activateKillSwitch,
    deactivateKillSwitch,
  };
}
