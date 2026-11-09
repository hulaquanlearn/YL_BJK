package cn.digitalworkbench.mobile;
import android.content.Context;
import android.widget.ImageView;

/** Pinned Lucide vector assets, with one consistent stroke and tint. */
final class NativeIcons {
    static int resource(String type) {
        switch(type) {
            case "bell":return R.drawable.ic_lucide_bell;
            case "person":return R.drawable.ic_lucide_user_round;
            case "star":return R.drawable.ic_lucide_star;
            case "arrow":return R.drawable.ic_lucide_chevron_right;
            case "logout":return R.drawable.ic_lucide_log_out;
            case "refresh":return R.drawable.ic_lucide_refresh_cw;
            case "book":return R.drawable.ic_lucide_book_open;
            case "inventory":return R.drawable.ic_lucide_package_search;
            case "movement":return R.drawable.ic_lucide_arrow_left_right;
            case "cart":return R.drawable.ic_lucide_shopping_cart;
            case "layers":return R.drawable.ic_lucide_boxes;
            case "check":return R.drawable.ic_lucide_clipboard_check;
            case "duties":return R.drawable.ic_lucide_calendar_check;
            case "fire":return R.drawable.ic_lucide_fire_extinguisher;
            case "agv":return R.drawable.ic_lucide_forklift;
            default:return R.drawable.ic_lucide_layout_grid;
        }
    }
    static ImageView view(Context c,String type,int color) {
        ImageView icon=new ImageView(c);icon.setImageResource(resource(type));icon.setColorFilter(color);icon.setScaleType(ImageView.ScaleType.FIT_CENTER);icon.setImportantForAccessibility(ImageView.IMPORTANT_FOR_ACCESSIBILITY_NO);return icon;
    }
    static String forPath(String p){
        if(p.startsWith("/agv-vehicles"))return "agv";
        if(p.startsWith("/fire-inspection"))return "fire";
        if(p.contains("knowledge"))return "book";
        if(p.contains("duties"))return "duties";
        if(p.contains("warehouse"))return "layers";
        if(p.contains("replenishment"))return "cart";
        if(p.contains("movements"))return "movement";
        if(p.contains("check"))return "check";
        if(p.contains("account"))return "person";
        return "inventory";
    }
}
