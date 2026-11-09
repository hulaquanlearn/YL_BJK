package cn.digitalworkbench.mobile;
import android.app.Instrumentation;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;

/** Every shipped icon must inflate and actually draw visible pixels. */
final class NativeIconChecks {
    static int run(Instrumentation test) {
        int checks=0;
        for(String name:new String[]{"grid","bell","person","star","arrow","logout","refresh","book","inventory","movement","cart","layers","check","duties","fire","agv"}) {
            Drawable icon=test.getTargetContext().getDrawable(NativeIcons.resource(name));
            Bitmap bitmap=Bitmap.createBitmap(96,96,Bitmap.Config.ARGB_8888);
            icon.setBounds(0,0,96,96);icon.draw(new Canvas(bitmap));int visible=0;
            for(int x=0;x<96;x++)for(int y=0;y<96;y++)if((bitmap.getPixel(x,y)>>>24)>32)visible++;
            bitmap.recycle();if(visible<100)throw new AssertionError("Invisible icon: "+name);checks++;
        }
        return checks;
    }
}
