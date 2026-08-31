import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/client';
import { OIDC_CONFIG } from '../config';
import { oidcService } from '../services/oidc';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('VENDOR');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleOidcLogin = () => {
    setError('');
    oidcService.initiateLogin().catch((err) => {
      setError(err.message || 'Failed to initiate OIDC redirect flow.');
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    authApi
      .login(email, password, role)
      .then((res) => {
        login({ userId: res.userId, email: res.email, name: res.name, role: res.role }, res.token);
        if (res.role === 'ADMIN') navigate('/admin');
        else navigate('/');
      })
      .catch((err) => setError(err.message || 'Login failed'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-md">
      <div className="animate-fadeIn">
        <h1 className="font-display text-2xl font-bold mb-6">Login</h1>
        
        {OIDC_CONFIG.enabled && (
          <div className="mb-6">
            <button
              type="button"
              onClick={handleOidcLogin}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-bold py-3 px-4 rounded-lg shadow-md transition-all duration-200"
            >
              <span>🔑</span> Login with Cloud Provider (OIDC)
            </button>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-stone-500">Or use local account</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-stone-300 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-stone-300 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border border-stone-300 rounded-lg p-2">
              <option value="VENDOR">Vendor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-lg">
            Login
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className="text-amber-600 hover:underline">Forgot Password</Link>
          {' · '}
          <Link to="/register" className="text-amber-600 hover:underline">Create an Account</Link>
        </p>
      </div>
    </div>
  );
}