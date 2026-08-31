import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { oidcService } from '../services/oidc';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

export default function Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setError('Missing authorization code or state from identity provider.');
      return;
    }

    oidcService
      .handleCallback(code, state)
      .then(async (result) => {
        try {
          // Fetch user profile from backend (triggers JIT provisioning)
          const profileResponse = await fetch(`${API_BASE_URL}/api/profile`, {
            headers: {
              'Authorization': `Bearer ${result.accessToken}`
            }
          });
          
          if (!profileResponse.ok) {
            throw new Error('Failed to retrieve or provision user profile from backend.');
          }
          
          const localUser = await profileResponse.json();
          
          // Log into AuthContext (storing access token and synced profile details)
          login(localUser, result.accessToken);
          
          if (localUser.role === 'ADMIN') {
            navigate('/admin');
          } else {
            navigate('/');
          }
        } catch (e) {
          setError(e.message || 'Failed to sync authentication profile with the backend.');
        }
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Token exchange failed.');
      });
  }, [searchParams, login, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6 text-red-400">
        <div className="bg-slate-800 p-8 rounded-xl border border-red-900 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">Authentication Error</h2>
          <p className="mb-6 text-gray-300">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-bold py-3 rounded-lg transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-100">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-400">Exchanging code for tokens and synchronizing account...</p>
      </div>
    </div>
  );
}
