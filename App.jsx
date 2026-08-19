import React, { useEffect, useState } from 'react';
import { initMiniApp } from '@telegram-apps/sdk';

export default function MiniApp() {
  const [miniApp] = initMiniApp();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('catalog');
  const [ticketText, setTicketText] = useState('');

  useEffect(() => {
    miniApp.setHeaderColor('#0088cc');
    miniApp.mount();
    
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser) {
      setUser(tgUser);
    }
  }, []);

  const handleSubmitTicket = () => {
    if (!ticketText) return;

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.sendData(JSON.stringify({
        type: 'CREATE_TICKET',
        issue: ticketText,
        user_id: user?.id
      }));
      window.Telegram.WebApp.close();
    } else {
      alert("Ticket submitted: " + ticketText);
    }
  };

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', backgroundColor: 'var(--tg-theme-bg-color, #fff)', color: 'var(--tg-theme-text-color, #000)', minHeight: '100vh' }}>
      <header style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
        <h3>👋 Welcome, {user ? user.first_name : 'Valued Customer'}!</h3>
        <p style={{ fontSize: '12px', color: '#666' }}>Manage your orders & support directly inside Telegram</p>
      </header>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={() => setActiveTab('catalog')} 
          style={{ flex: 1, padding: '10px', backgroundColor: activeTab === 'catalog' ? '#0088cc' : '#eee', color: activeTab === 'catalog' ? '#fff' : '#000', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          Catalog
        </button>
        <button 
          onClick={() => setActiveTab('ticket')} 
          style={{ flex: 1, padding: '10px', backgroundColor: activeTab === 'ticket' ? '#0088cc' : '#eee', color: activeTab === 'ticket' ? '#fff' : '#000', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          New Ticket
        </button>
      </div>

      {activeTab === 'catalog' && (
        <div>
          <h4>🛍️ Popular Products</h4>
          <div style={{ display: 'grid', gap: '12px', marginTop: '10px' }}>
            {['Pro Plan Subscription - $29', 'Custom Bot Setup - $99', 'Priority Support Addon - $15'].map((item, idx) => (
              <div key={idx} style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{item}</span>
                <button style={{ backgroundColor: '#28a745', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px' }}>Select</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ticket' && (
        <div>
          <h4>🎫 Submit Support Request</h4>
          <textarea 
            rows={4}
            placeholder="Describe your issue here..." 
            value={ticketText}
            onChange={(e) => setTicketText(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '12px', boxSizing: 'border-box' }}
          />
          <button 
            onClick={handleSubmitTicket} 
            style={{ width: '100%', padding: '12px', backgroundColor: '#0088cc', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Submit to Human Support
          </button>
        </div>
      )}
    </div>
  );
}
