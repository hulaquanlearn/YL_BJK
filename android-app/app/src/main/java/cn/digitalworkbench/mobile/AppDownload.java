package cn.digitalworkbench.mobile;
import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.widget.*;
import android.view.Gravity;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.qrcode.QRCodeWriter;
final class AppDownload {
 static final String URL="https://czsdsg.cn/app-download";
 static void show(Activity activity){
  LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);body.setGravity(Gravity.CENTER);int padding=Math.round(20*activity.getResources().getDisplayMetrics().density);body.setPadding(padding,padding,padding,padding);
  try{com.google.zxing.common.BitMatrix matrix=new QRCodeWriter().encode(URL,BarcodeFormat.QR_CODE,600,600);Bitmap bitmap=Bitmap.createBitmap(600,600,Bitmap.Config.ARGB_8888);for(int y=0;y<600;y++)for(int x=0;x<600;x++)bitmap.setPixel(x,y,matrix.get(x,y)?0xff142332:0xffffffff);ImageView qr=new ImageView(activity);qr.setImageBitmap(bitmap);qr.setContentDescription("扫码打开最新版App下载页");body.addView(qr,new LinearLayout.LayoutParams(padding*12,padding*12));}catch(Exception ignored){TextView fallback=new TextView(activity);fallback.setText(URL);fallback.setTextIsSelectable(true);body.addView(fallback);}
  TextView description=new TextView(activity);description.setText("扫码选择安卓或苹果\n发布新版后，此二维码仍然有效");description.setTextColor(NativeHome.INK);description.setTextSize(15);description.setGravity(Gravity.CENTER);body.addView(description);
  new AlertDialog.Builder(activity).setView(body).setNegativeButton("关闭",null).setPositiveButton("复制下载地址",(d,w)->{android.content.ClipboardManager clipboard=(android.content.ClipboardManager)activity.getSystemService(Activity.CLIPBOARD_SERVICE);clipboard.setPrimaryClip(android.content.ClipData.newPlainText("App下载",URL));Toast.makeText(activity,"下载地址已复制",Toast.LENGTH_SHORT).show();}).show();
 }
}
