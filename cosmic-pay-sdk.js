/* cosmic-pay-sdk.js */
(function(window) {
    'use strict';

    const APP_KEY = 'cosmic_pay_2024';
    const STORAGE_PREFIX = 'cosmicpay_';

    // 加密解密工具
    const Crypto = {
        decode: function(encoded, key) {
            try {
                const decoded = atob(encoded);
                const unshifted = decoded.split('').map((c, i) => 
                    String.fromCharCode(c.charCodeAt(0) - (key.charCodeAt(i % key.length) % 10))
                ).join('');
                const jsonStr = decodeURIComponent(escape(atob(unshifted)));
                return JSON.parse(jsonStr);
            } catch (e) { return null; }
        }
    };

    // 本地存储工具
    const Storage = {
        get: (key) => {
            try {
                const data = localStorage.getItem(STORAGE_PREFIX + key);
                return data ? JSON.parse(data) : null;
            } catch (e) { return null; }
        },
        set: (key, value) => {
            localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        }
    };

    // 宇宙支付 SDK 核心对象
    const CosmicPay = {
        // 1. 检查是否是VIP
        isVIP: function() {
            const vipData = Storage.get('vip_status');
            return !!vipData;
        },

        // 2. 获取VIP信息
        getVIPInfo: function() {
            return Storage.get('vip_status');
        },

        // 3. 兑换凭证
        redeemVIP: function(code) {
            const data = Crypto.decode(code, APP_KEY);
            
            if (!data) {
                return { success: false, message: '无效的凭证格式' };
            }

            let isValidVIPCode = false;
            
            // 兼容红包码 (type === 'redpacket')
            if (data.type === 'redpacket') {
                if (data.amount >= 0) isValidVIPCode = true; 
            } 
            // 兼容转账凭证 (to, amount存在)
            else if (data.to && data.amount) {
                if (data.remark && (data.remark.includes('VIP') || data.remark.includes('会员'))) {
                    isValidVIPCode = true;
                }
            }
            // 兼容管理员工具生成的专用凭证
            else if (data.product === 'music_vip') {
                isValidVIPCode = true;
            }

            if (isValidVIPCode) {
                const vipInfo = {
                    activatedAt: new Date().toISOString(),
                    code: code,
                    source: data.fromName || '宇宙支付',
                    duration: '永久'
                };
                Storage.set('vip_status', vipInfo);
                return { success: true, message: 'VIP激活成功！尽情享受音乐吧！' };
            } else {
                return { success: false, message: '该凭证无法用于开通音乐VIP' };
            }
        },

        // 4. 显示支付弹窗
        showPayModal: function(options) {
            const { title, amount, description, onSuccess, onClose } = options;
            
            // 如果已经是VIP，直接返回
            if (this.isVIP()) {
                if (onSuccess) onSuccess({ message: '已是VIP' });
                return;
            }

            // 创建弹窗HTML
            const modalHTML = `
                <div id="cosmic-pay-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; align-items: center; justify-content: center; font-family: 'Noto Sans SC', sans-serif;">
                    <div style="background: #fff; padding: 30px; border-radius: 20px; width: 90%; max-width: 420px; text-align: center; color: #333; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #f1c40f, #f39c12); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="white"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                        </div>
                        <h3 style="margin: 0 0 10px; font-size: 24px; color: #2c3e50;">${title || '开通音乐VIP'}</h3>
                        <p style="color: #7f8c8d; margin-bottom: 25px; font-size: 14px; line-height: 1.6;">${description || '请输入管理员发放的支付凭证或VIP激活码'}</p>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px; border: 1px solid #eee;">
                            <input type="text" id="cosmic-pay-input" placeholder="粘贴凭证码..." style="width: 100%; border: 1px solid #ddd; padding: 12px; border-radius: 8px; box-sizing: border-box; font-size: 14px; outline: none; transition: border-color 0.3s;">
                        </div>

                        <div style="color: #e74c3c; font-size: 12px; margin-bottom: 15px; height: 15px;" id="cosmic-pay-error"></div>

                        <button id="cosmic-pay-confirm" style="width: 100%; background: linear-gradient(135deg, #3498db, #2980b9); color: white; border: none; padding: 14px; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; margin-bottom: 12px; transition: transform 0.2s, box-shadow 0.2s;">
                            确认激活
                        </button>
                        <button id="cosmic-pay-cancel" style="background: transparent; border: none; color: #95a5a6; cursor: pointer; font-size: 13px; padding: 5px;">
                            稍后再说
                        </button>
                    </div>
                </div>
            `;

            // 插入页面
            const div = document.createElement('div');
            div.innerHTML = modalHTML;
            document.body.appendChild(div);

            // 绑定事件
            const modal = document.getElementById('cosmic-pay-modal');
            const input = document.getElementById('cosmic-pay-input');
            const confirmBtn = document.getElementById('cosmic-pay-confirm');
            const cancelBtn = document.getElementById('cosmic-pay-cancel');
            const errorDiv = document.getElementById('cosmic-pay-error');

            // 自动聚焦
            setTimeout(() => input.focus(), 100);

            confirmBtn.onclick = () => {
                const code = input.value.trim();
                if (!code) {
                    errorDiv.textContent = '请输入凭证码';
                    return;
                }
                
                const result = this.redeemVIP(code);
                if (result.success) {
                    modal.remove();
                    if (onSuccess) onSuccess(result);
                } else {
                    errorDiv.textContent = result.message;
                    input.style.borderColor = '#e74c3c';
                }
            };

            cancelBtn.onclick = () => {
                modal.remove();
                if (onClose) onClose();
            };
            
            input.onkeydown = (e) => {
                if (e.key === 'Enter') confirmBtn.click();
            };
        }
    };

    window.CosmicPay = CosmicPay;

})(window);
