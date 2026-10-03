/**
 * THRIVEWOO POS — THERMAL RECEIPT (58mm / 80mm ESC/POS) GENERATOR
 * File: /public/js/pos/pos-receipt.js
 */

(function (window) {
  'use strict';

  let _currentReceiptData = null;
  let _currentFormat = 'thermal_80mm'; // thermal_80mm | thermal_58mm

  const PosReceipt = {
    renderAndOpenReceipt: function (saleData) {
      _currentReceiptData = saleData;

      const modalEl = document.getElementById('posReceiptModal');
      this.renderReceiptContent(saleData);

      if (typeof bootstrap !== 'undefined' && modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    },

    setFormat: function (format) {
      _currentFormat = format;
      document.querySelectorAll('.pos-receipt-format-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-format') === format);
      });
      if (_currentReceiptData) {
        this.renderReceiptContent(_currentReceiptData);
      }
    },

    renderReceiptContent: function (sale) {
      const container = document.getElementById('pos-receipt-content');
      if (!container) return;

      const is58mm = (_currentFormat === 'thermal_58mm');
      const storeName = "ThriveWoo Central Store";
      const storeAddress = "145 Collins Street, Melbourne VIC";
      const storePhone = "+61 3 9876 5432";
      const taxId = "ABN 88 123 456 789";

      const itemsHtml = (sale.items || []).map(it => `
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <div style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:4px;">
            ${it.qty}x ${it.name}
          </div>
          <div style="text-align:right;min-width:55px;">${PosUtils.formatCurrency(it.total)}</div>
        </div>
      `).join('');

      container.className = `pos-thermal-receipt ${is58mm ? 'format-58mm' : 'format-80mm'}`;
      container.innerHTML = `
        <div id="pos-printable-receipt">
          <div class="receipt-center receipt-bold" style="font-size:15px;margin-bottom:2px;">${storeName}</div>
          <div class="receipt-center" style="font-size:11px;color:#333;">${storeAddress}</div>
          <div class="receipt-center" style="font-size:11px;color:#333;">Tel: ${storePhone}</div>
          <div class="receipt-center" style="font-size:11px;color:#333;margin-bottom:6px;">${taxId}</div>
          
          <div class="receipt-divider"></div>
          
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span>Inv: ${sale.invoice_no}</span>
            <span>Reg: ${sale.register_id || 'REG-01'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span>Date: ${PosUtils.formatDate(sale.created_at)}</span>
            <span>Staff: ${sale.cashier_name || 'Staff'}</span>
          </div>
          <div style="font-size:11px;">Customer: ${sale.customer_name || 'Guest'}</div>

          <div class="receipt-divider"></div>
          
          <div style="display:flex;justify-content:space-between;font-weight:bold;margin-bottom:4px;font-size:11px;">
            <span>ITEM</span>
            <span>AMOUNT</span>
          </div>
          
          ${itemsHtml}

          <div class="receipt-divider"></div>

          <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
            <span>Subtotal:</span>
            <span>${PosUtils.formatCurrency(sale.subtotal)}</span>
          </div>
          ${sale.discount_amount > 0 ? `
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;color:#d97706;">
            <span>Discount:</span>
            <span>-${PosUtils.formatCurrency(sale.discount_amount)}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Included Tax (10%):</span>
            <span>${PosUtils.formatCurrency(sale.tax_amount)}</span>
          </div>

          <div class="receipt-divider"></div>

          <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:bold;margin:6px 0;">
            <span>TOTAL:</span>
            <span>${PosUtils.formatCurrency(sale.grand_total)}</span>
          </div>

          <div class="receipt-divider"></div>

          <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px;">
            <span>Paid by (${sale.payment_method || 'Cash'}):</span>
            <span>${PosUtils.formatCurrency(sale.amount_paid)}</span>
          </div>
          ${(sale.payment_method === 'Cash' && sale.change_given > 0) ? `
          <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:bold;">
            <span>Change Given:</span>
            <span>${PosUtils.formatCurrency(sale.change_given)}</span>
          </div>` : ''}

          <div class="receipt-divider"></div>

          <div class="receipt-center" style="font-size:11px;margin-top:8px;">
            *** THANK YOU FOR YOUR VISIT ***<br>
            Please retain receipt for exchange within 14 days.<br>
            Powered by ThriveWoo POS
          </div>
        </div>
      `;
    },

    printReceipt: function () {
      window.print();
    }
  };

  window.PosReceipt = PosReceipt;
})(window);
